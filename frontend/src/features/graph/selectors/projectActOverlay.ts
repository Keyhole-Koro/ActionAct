import type { GraphNodeBase } from '@/features/graph/types';
import {
    GRAPH_ACT_NODE_HEIGHT,
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';

type ProjectActOverlayParams = {
    actNodes: GraphNodeBase[];
    persistedNodes: GraphNodeBase[];
    expandedNodeIds: string[];
};

// X distance from the rightmost persisted node to the first act lane
const GLOBAL_X_OFFSET = 220;
// Horizontal gap between lanes within a tree
const LANE_WIDTH = 340;
// Extra vertical gap between rows within a tree
const ROW_GAP = 28;
// Extra vertical gap between separate trees
const TREE_GAP = 48;

export function projectActOverlay({
    actNodes,
    persistedNodes,
    expandedNodeIds,
}: ProjectActOverlayParams): GraphNodeBase[] {
    if (actNodes.length === 0) return [];

    const persistedById = new Map(persistedNodes.map((n) => [n.id, n]));
    const expandedSet = new Set(expandedNodeIds);

    const maxPersistedRight = persistedNodes.reduce((max, n) => {
        const d = getNodeDimensions(n, expandedSet.has(n.id));
        return Math.max(max, n.position.x + d.width);
    }, 0);

    // Separate manually-positioned nodes from those that need layout
    const fixedNodes: GraphNodeBase[] = [];
    const floatNodes: GraphNodeBase[] = [];

    for (const node of actNodes) {
        if (node.data?.isManualPosition === true) {
            fixedNodes.push(node);
        } else {
            floatNodes.push(node);
        }
    }

    if (floatNodes.length === 0) return fixedNodes;

    const floatIds = new Set(floatNodes.map((n) => n.id));

    // Build parent→children map (only among float nodes)
    const childrenMap = new Map<string, string[]>();
    for (const node of floatNodes) {
        const parentId =
            typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
        if (parentId && floatIds.has(parentId)) {
            const arr = childrenMap.get(parentId) ?? [];
            arr.push(node.id);
            childrenMap.set(parentId, arr);
        }
    }

    // Roots: float nodes with no float-node parent
    const roots = floatNodes.filter((n) => {
        const parentId =
            typeof n.data?.parentId === 'string' ? n.data.parentId : undefined;
        return !parentId || !floatIds.has(parentId);
    });

    // ── Per-tree layout ──────────────────────────────────────────────────────
    // Lanes and rows are LOCAL to each tree so that independent trees don't
    // force each other into ever-wider lane numbers.

    const laneMap = new Map<string, number>();   // nodeId → local lane within its tree
    const localRowMap = new Map<string, number>(); // nodeId → depth from its root
    const rootOf = new Map<string, string>();      // nodeId → rootId

    for (const root of roots) {
        // ── DFS lane assignment (local, resets per tree) ──
        // Returns the next available lane after this subtree.
        // First child inherits the parent's lane (vertical chain);
        // subsequent siblings start immediately after their predecessor's subtree.
        const assignLanes = (nodeId: string, startLane: number): number => {
            laneMap.set(nodeId, startLane);
            rootOf.set(nodeId, root.id);
            const children = childrenMap.get(nodeId) ?? [];
            if (children.length === 0) return startLane + 1;
            let nextLane = startLane;
            for (let i = 0; i < children.length; i++) {
                nextLane = assignLanes(children[i], i === 0 ? startLane : nextLane);
            }
            return nextLane;
        };

        assignLanes(root.id, 0);

        // ── BFS local row assignment ──
        const bfsQueue = [root.id];
        localRowMap.set(root.id, 0);
        let qi = 0;
        while (qi < bfsQueue.length) {
            const nodeId = bfsQueue[qi++];
            const row = localRowMap.get(nodeId)!;
            for (const childId of childrenMap.get(nodeId) ?? []) {
                if (!localRowMap.has(childId)) {
                    localRowMap.set(childId, row + 1);
                    bfsQueue.push(childId);
                }
            }
        }
    }

    // ── Per-tree row heights ─────────────────────────────────────────────────
    const rowHeightsPerRoot = new Map<string, number[]>();
    for (const node of floatNodes) {
        const rootId = rootOf.get(node.id);
        if (!rootId) continue;
        const localRow = localRowMap.get(node.id) ?? 0;
        const { height } = getNodeDimensions(node, expandedSet.has(node.id));
        const heights = rowHeightsPerRoot.get(rootId) ?? [];
        while (heights.length <= localRow) heights.push(0);
        heights[localRow] = Math.max(heights[localRow], height);
        rowHeightsPerRoot.set(rootId, heights);
    }

    // ── Per-tree cumulative Y offsets ────────────────────────────────────────
    const rowYOffsetsPerRoot = new Map<string, number[]>();
    for (const [rootId, heights] of rowHeightsPerRoot) {
        const offsets = [0];
        for (let r = 1; r < heights.length; r++) {
            offsets.push(offsets[r - 1] + heights[r - 1] + ROW_GAP);
        }
        rowYOffsetsPerRoot.set(rootId, offsets);
    }

    // Total pixel height of a tree
    const getTreeHeight = (rootId: string): number => {
        const heights = rowHeightsPerRoot.get(rootId) ?? [GRAPH_ACT_NODE_HEIGHT];
        const offsets = rowYOffsetsPerRoot.get(rootId) ?? [0];
        return offsets[offsets.length - 1] + heights[heights.length - 1];
    };

    // ── Anchor Y per root (center of primary referenced persisted node) ───────
    const anchorYPerRoot = new Map<string, number>();
    let fallbackY = 200;
    for (const root of roots) {
        const referencedIds: string[] = Array.isArray(root.data?.referencedNodeIds)
            ? (root.data.referencedNodeIds as unknown[]).filter(
                  (v): v is string => typeof v === 'string',
              )
            : [];
        const anchor = referencedIds.map((id) => persistedById.get(id)).find(Boolean);
        if (anchor) {
            const ad = getNodeDimensions(anchor, expandedSet.has(anchor.id));
            anchorYPerRoot.set(root.id, anchor.position.y + ad.height / 2);
        } else {
            anchorYPerRoot.set(root.id, fallbackY);
            fallbackY += getTreeHeight(root.id) + TREE_GAP;
        }
    }

    // ── Sort roots by anchor Y, assign final Y origins (bidirectional relaxation) ─
    const sortedRoots = [...roots].sort(
        (a, b) => (anchorYPerRoot.get(a.id) ?? 0) - (anchorYPerRoot.get(b.id) ?? 0),
    );

    const idealYOf = (rootId: string): number => {
        const anchorY = anchorYPerRoot.get(rootId) ?? 200;
        const firstRowH = (rowHeightsPerRoot.get(rootId) ?? [GRAPH_ACT_NODE_HEIGHT])[0];
        return anchorY - firstRowH / 2;
    };

    // Initialize at ideal positions
    const treeOriginY = new Map<string, number>();
    for (const root of sortedRoots) {
        treeOriginY.set(root.id, idealYOf(root.id));
    }

    // Alternate forward (push down) + backward (pull toward ideal) passes.
    // Forward ensures trees don't overlap the tree above.
    // Backward pulls trees that were shoved down back toward their anchor.
    // 3 iterations converges for typical layouts.
    for (let iter = 0; iter < 3; iter++) {
        // Forward: push down if overlapping tree above
        let prevBottom = -Infinity;
        for (const root of sortedRoots) {
            const y = Math.max(treeOriginY.get(root.id)!, prevBottom + TREE_GAP);
            treeOriginY.set(root.id, y);
            prevBottom = y + getTreeHeight(root.id);
        }

        // Backward: pull toward ideal, constrained only by tree below
        let nextTop = Infinity;
        for (let i = sortedRoots.length - 1; i >= 0; i--) {
            const root = sortedRoots[i];
            const maxAllowed = nextTop - TREE_GAP - getTreeHeight(root.id);
            // Go to idealY if room permits; otherwise as high as maxAllowed allows
            const newY = Math.min(idealYOf(root.id), maxAllowed);
            treeOriginY.set(root.id, newY);
            nextTop = newY;
        }
    }

    // Final forward pass: guarantee no overlap from above after backward pulls
    let finalPrevBottom = -Infinity;
    for (const root of sortedRoots) {
        const y = Math.max(treeOriginY.get(root.id)!, finalPrevBottom + TREE_GAP);
        treeOriginY.set(root.id, y);
        finalPrevBottom = y + getTreeHeight(root.id);
    }

    // ── Final positions ──────────────────────────────────────────────────────
    const baseX = maxPersistedRight + GLOBAL_X_OFFSET;

    const positionedFloat: GraphNodeBase[] = floatNodes.map((node) => {
        const lane = laneMap.get(node.id) ?? 0;
        const rootId = rootOf.get(node.id) ?? roots[0]?.id ?? '';
        const localRow = localRowMap.get(node.id) ?? 0;
        const offsets = rowYOffsetsPerRoot.get(rootId) ?? [0];
        const originY = treeOriginY.get(rootId) ?? 0;

        return {
            ...node,
            position: {
                x: baseX + lane * LANE_WIDTH,
                y: originY + (offsets[localRow] ?? 0),
            },
            data: { ...node.data, overlayPositioned: true },
        };
    });

    return [...positionedFloat, ...fixedNodes];
}

function getNodeDimensions(node: GraphNodeBase, isExpanded: boolean) {
    const data = (node.data ?? {}) as Record<string, unknown>;
    const kind = typeof data.kind === 'string' ? data.kind : undefined;
    const label = typeof data.label === 'string' ? data.label : undefined;
    const layout = getLayoutDimensionsForNodeType(node.type, isExpanded, kind);
    return {
        width:
            node.type === 'customTask'
                ? isExpanded
                    ? getExpandedNodeWidth(label, kind)
                    : getCollapsedNodeWidth(label, kind, false)
                : layout.width,
        height: layout.height,
    };
}

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

// X distance from the rightmost persisted node to the root column (depth=0)
const GLOBAL_X_OFFSET = 220;
// Horizontal gap between depth levels (depth=0, depth=1, depth=2, …)
const COLUMN_GAP = 320;
// Vertical gap between sibling subtrees within a tree
const SIBLING_GAP = 24;
// Vertical gap between separate trees
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
    const nodeById = new Map(floatNodes.map((n) => [n.id, n]));

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

    // ── Depth assignment (BFS from each root, resets to 0 per tree) ──────────
    // X = baseX + depth * COLUMN_GAP — depth is independent per tree
    const depthMap = new Map<string, number>();

    for (const root of roots) {
        const queue = [root.id];
        depthMap.set(root.id, 0);
        let qi = 0;
        while (qi < queue.length) {
            const nodeId = queue[qi++];
            const depth = depthMap.get(nodeId)!;
            for (const childId of childrenMap.get(nodeId) ?? []) {
                if (!depthMap.has(childId)) {
                    depthMap.set(childId, depth + 1);
                    queue.push(childId);
                }
            }
        }
    }

    // ── Subtree height (post-order) ───────────────────────────────────────────
    // subtreeHeight(n) = max(ownHeight, sum(children subtreeHeights) + gaps)
    const subtreeHeightCache = new Map<string, number>();

    const subtreeHeight = (nodeId: string): number => {
        const cached = subtreeHeightCache.get(nodeId);
        if (cached !== undefined) return cached;
        const node = nodeById.get(nodeId);
        const own = node ? getNodeDimensions(node, expandedSet.has(nodeId)).height : GRAPH_ACT_NODE_HEIGHT;
        const children = childrenMap.get(nodeId) ?? [];
        if (children.length === 0) {
            subtreeHeightCache.set(nodeId, own);
            return own;
        }
        const childTotal = children.reduce((s, c) => s + subtreeHeight(c), 0)
            + SIBLING_GAP * (children.length - 1);
        const result = Math.max(own, childTotal);
        subtreeHeightCache.set(nodeId, result);
        return result;
    };

    for (const root of roots) subtreeHeight(root.id);

    // ── Y position (top-down): place children sequentially, center parent ─────
    const posYMap = new Map<string, number>();

    const assignY = (nodeId: string, subtreeTop: number): void => {
        const node = nodeById.get(nodeId);
        const own = node ? getNodeDimensions(node, expandedSet.has(nodeId)).height : GRAPH_ACT_NODE_HEIGHT;
        const children = childrenMap.get(nodeId) ?? [];

        if (children.length === 0) {
            posYMap.set(nodeId, subtreeTop);
            return;
        }

        // Place children sequentially from subtreeTop
        let cursor = subtreeTop;
        for (const childId of children) {
            assignY(childId, cursor);
            cursor += subtreeHeight(childId) + SIBLING_GAP;
        }

        // Center this node vertically within its children's combined span
        const firstChildY = posYMap.get(children[0])!;
        const lastChild = children[children.length - 1];
        const lastChildNode = nodeById.get(lastChild);
        const lastChildH = lastChildNode
            ? getNodeDimensions(lastChildNode, expandedSet.has(lastChild)).height
            : GRAPH_ACT_NODE_HEIGHT;
        const lastChildY = posYMap.get(lastChild)!;
        posYMap.set(nodeId, (firstChildY + lastChildY + lastChildH) / 2 - own / 2);
    };

    // ── Anchor Y per root ─────────────────────────────────────────────────────
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
            fallbackY += subtreeHeight(root.id) + TREE_GAP;
        }
    }

    // ── Sort roots by anchor Y, then resolve overlaps ─────────────────────────
    const sortedRoots = [...roots].sort(
        (a, b) => (anchorYPerRoot.get(a.id) ?? 0) - (anchorYPerRoot.get(b.id) ?? 0),
    );

    // Ideal tree origin Y: root node's top-left so its center aligns with anchor
    const idealOriginY = (rootId: string): number => {
        const anchorY = anchorYPerRoot.get(rootId) ?? 200;
        const node = nodeById.get(rootId);
        const rootH = node ? getNodeDimensions(node, expandedSet.has(rootId)).height : GRAPH_ACT_NODE_HEIGHT;
        return anchorY - rootH / 2;
    };

    const treeOriginY = new Map<string, number>();
    for (const root of sortedRoots) treeOriginY.set(root.id, idealOriginY(root.id));

    // 3 iterations of forward+backward relaxation to resolve overlaps
    for (let iter = 0; iter < 3; iter++) {
        // Forward: push down if overlapping tree above
        let prevBottom = -Infinity;
        for (const root of sortedRoots) {
            const y = Math.max(treeOriginY.get(root.id)!, prevBottom + TREE_GAP);
            treeOriginY.set(root.id, y);
            prevBottom = y + subtreeHeight(root.id);
        }
        // Backward: pull toward ideal, constrained by tree below
        let nextTop = Infinity;
        for (let i = sortedRoots.length - 1; i >= 0; i--) {
            const root = sortedRoots[i];
            const maxAllowed = nextTop - TREE_GAP - subtreeHeight(root.id);
            treeOriginY.set(root.id, Math.min(idealOriginY(root.id), maxAllowed));
            nextTop = treeOriginY.get(root.id)!;
        }
    }
    // Final forward pass
    let finalPrevBottom = -Infinity;
    for (const root of sortedRoots) {
        const y = Math.max(treeOriginY.get(root.id)!, finalPrevBottom + TREE_GAP);
        treeOriginY.set(root.id, y);
        finalPrevBottom = y + subtreeHeight(root.id);
    }

    // ── Run assignY for each tree from its resolved origin ────────────────────
    for (const root of sortedRoots) {
        assignY(root.id, treeOriginY.get(root.id) ?? 0);
    }

    // ── Emit positioned nodes ─────────────────────────────────────────────────
    const baseX = maxPersistedRight + GLOBAL_X_OFFSET;

    const positionedFloat: GraphNodeBase[] = floatNodes.map((node) => ({
        ...node,
        position: {
            x: baseX + (depthMap.get(node.id) ?? 0) * COLUMN_GAP,
            y: posYMap.get(node.id) ?? 0,
        },
        data: { ...node.data, overlayPositioned: true },
    }));

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

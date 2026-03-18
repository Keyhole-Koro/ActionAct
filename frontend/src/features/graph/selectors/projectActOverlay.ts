import type { GraphNodeBase } from '@/features/graph/types';
import {
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
// Horizontal gap between lanes (lane 0, lane 1, lane 2, …)
const LANE_WIDTH = 340;
// Extra vertical gap between rows
const ROW_GAP = 28;

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

    // Roots: float nodes whose parentId is absent or outside floatNodes
    const roots = floatNodes.filter((n) => {
        const parentId =
            typeof n.data?.parentId === 'string' ? n.data.parentId : undefined;
        return !parentId || !floatIds.has(parentId);
    });

    // ── Lane assignment (DFS) ────────────────────────────────────────────────
    // Each root gets a new lane. First child inherits parent lane (main branch
    // continues straight). Each additional sibling gets a new lane (branch out).
    const laneMap = new Map<string, number>();
    let nextLane = 0;

    function assignLanes(nodeId: string, lane: number): void {
        laneMap.set(nodeId, lane);
        const children = childrenMap.get(nodeId) ?? [];
        for (let i = 0; i < children.length; i++) {
            if (i === 0) {
                // First child continues on the same lane
                assignLanes(children[i], lane);
            } else {
                // Subsequent children branch onto new lanes
                assignLanes(children[i], nextLane++);
            }
        }
    }

    for (const root of roots) {
        assignLanes(root.id, nextLane++);
    }

    // ── Row assignment (BFS from all roots simultaneously) ───────────────────
    const rowMap = new Map<string, number>();
    const queue: string[] = [];

    for (const root of roots) {
        rowMap.set(root.id, 0);
        queue.push(root.id);
    }

    let qi = 0;
    while (qi < queue.length) {
        const nodeId = queue[qi++];
        const row = rowMap.get(nodeId)!;
        for (const childId of childrenMap.get(nodeId) ?? []) {
            if (!rowMap.has(childId)) {
                rowMap.set(childId, row + 1);
                queue.push(childId);
            }
        }
    }

    // ── Dynamic row heights ──────────────────────────────────────────────────
    const maxRow = Math.max(0, ...Array.from(rowMap.values()));
    const rowHeights = new Array<number>(maxRow + 1).fill(0);

    for (const node of floatNodes) {
        const row = rowMap.get(node.id) ?? 0;
        const { height } = getNodeDimensions(node, expandedSet.has(node.id));
        rowHeights[row] = Math.max(rowHeights[row], height);
    }

    // Cumulative Y offsets per row (row 0 starts at 0)
    const rowYOffset = new Array<number>(maxRow + 1).fill(0);
    for (let r = 1; r <= maxRow; r++) {
        rowYOffset[r] = rowYOffset[r - 1] + rowHeights[r - 1] + ROW_GAP;
    }

    // ── Y anchor: center-of-mass of all referenced persisted nodes ───────────
    const anchorYs: number[] = [];
    for (const root of roots) {
        const referencedIds: string[] = Array.isArray(root.data?.referencedNodeIds)
            ? (root.data.referencedNodeIds as unknown[]).filter(
                  (v): v is string => typeof v === 'string',
              )
            : [];
        const anchor = referencedIds.map((id) => persistedById.get(id)).find(Boolean);
        if (anchor) {
            const ad = getNodeDimensions(anchor, expandedSet.has(anchor.id));
            anchorYs.push(anchor.position.y + ad.height / 2);
        }
    }

    const totalLayoutHeight =
        rowYOffset[maxRow] + rowHeights[maxRow];

    const baseY =
        anchorYs.length > 0
            ? anchorYs.reduce((a, b) => a + b, 0) / anchorYs.length -
              totalLayoutHeight / 2
            : 100;

    const baseX = maxPersistedRight + GLOBAL_X_OFFSET;

    // ── Map back to graph nodes ──────────────────────────────────────────────
    const positionedFloat: GraphNodeBase[] = floatNodes.map((node) => {
        const lane = laneMap.get(node.id) ?? 0;
        const row = rowMap.get(node.id) ?? 0;
        return {
            ...node,
            position: {
                x: baseX + lane * LANE_WIDTH,
                y: baseY + rowYOffset[row],
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

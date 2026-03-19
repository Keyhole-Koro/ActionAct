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

const SIDECAR_OFFSET_X = 220;
const SIDECAR_STACK_GAP_Y = 28;
const GENERAL_LANE_OFFSET_X = 320;
const GENERAL_LANE_START_Y = 140;
const GENERAL_LANE_GAP_Y = 36;
const COLLISION_GAP = 12;

type Rect = { x: number; y: number; width: number; height: number };

function hasStablePosition(node: GraphNodeBase) {
    return Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y);
}

/**
 * Returns the first Y >= preferredY at which a rect of (x, width, height) does not
 * overlap any rectangle in `occupied` (with an additional gap on all sides).
 * Only scans downward to avoid unbounded search.
 */
function findFreeY(
    x: number,
    width: number,
    height: number,
    occupied: Rect[],
    preferredY: number,
    gap: number,
): number {
    let candidateY = preferredY;
    for (let iter = 0; iter < 200; iter++) {
        const blocking = occupied.find(
            (o) =>
                x < o.x + o.width + gap &&
                x + width + gap > o.x &&
                candidateY < o.y + o.height + gap &&
                candidateY + height + gap > o.y,
        );
        if (!blocking) {
            return candidateY;
        }
        candidateY = blocking.y + blocking.height + gap;
    }
    return candidateY;
}

export function projectActOverlay({
    actNodes,
    persistedNodes,
    expandedNodeIds,
}: ProjectActOverlayParams): GraphNodeBase[] {
    if (actNodes.length === 0) {
        return [];
    }

    const persistedById = new Map(persistedNodes.map((node) => [node.id, node]));
    const expandedSet = new Set(expandedNodeIds);
    const maxPersistedRight = persistedNodes.reduce((max, node) => {
        const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
        return Math.max(max, node.position.x + dimensions.width);
    }, 0);

    const referencedBuckets = new Map<string, GraphNodeBase[]>();
    const fixedNodes: GraphNodeBase[] = [];
    const generalLaneNodes: GraphNodeBase[] = [];

    for (const node of actNodes) {
        // Preserve existing coordinates to avoid jitter while streaming/thinking updates arrive.
        if (node.data?.isManualPosition === true || hasStablePosition(node)) {
            fixedNodes.push(node);
            continue;
        }

        const referencedNodeIds = Array.isArray(node.data?.referencedNodeIds)
            ? node.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
            : [];
        const anchorId = referencedNodeIds.find((nodeId) => persistedById.has(nodeId));

        if (!anchorId) {
            generalLaneNodes.push(node);
            continue;
        }

        const bucket = referencedBuckets.get(anchorId) ?? [];
        bucket.push(node);
        referencedBuckets.set(anchorId, bucket);
    }

    // Build occupied rects from persisted nodes and already-fixed act nodes so that
    // newly placed nodes can avoid overlapping them.
    const occupiedRects: Rect[] = [
        ...persistedNodes.map((node) => {
            const d = getNodeDimensions(node, expandedSet.has(node.id));
            return { x: node.position.x, y: node.position.y, width: d.width, height: d.height };
        }),
        ...fixedNodes.map((node) => {
            const d = getNodeDimensions(node, expandedSet.has(node.id));
            return { x: node.position.x, y: node.position.y, width: d.width, height: d.height };
        }),
    ];

    const positionedReferenced = [...referencedBuckets.entries()].flatMap(([anchorId, nodes]) => {
        const anchor = persistedById.get(anchorId);
        if (!anchor) {
            return nodes;
        }

        const anchorDimensions = getNodeDimensions(anchor, expandedSet.has(anchor.id));
        const baseX = anchor.position.x + anchorDimensions.width + SIDECAR_OFFSET_X;
        const anchorCenterY = anchor.position.y + (anchorDimensions.height / 2);

        const totalHeight = nodes.reduce((sum, node, index) => {
            const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
            return sum + dimensions.height + (index > 0 ? SIDECAR_STACK_GAP_Y : 0);
        }, 0);

        const groupWidth = Math.max(...nodes.map((n) => getNodeDimensions(n, expandedSet.has(n.id)).width));
        const desiredStartY = anchorCenterY - totalHeight / 2;
        let currentY = findFreeY(baseX, groupWidth, totalHeight, occupiedRects, desiredStartY, COLLISION_GAP);

        return nodes.map((node) => {
            const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
            const positionedNode: GraphNodeBase = {
                ...node,
                position: { x: baseX, y: currentY },
            };
            occupiedRects.push({ x: baseX, y: currentY, width: dimensions.width, height: dimensions.height });
            currentY += dimensions.height + SIDECAR_STACK_GAP_Y;
            return positionedNode;
        });
    });

    const generalLaneX = maxPersistedRight + GENERAL_LANE_OFFSET_X;
    let nextGeneralLaneY = GENERAL_LANE_START_Y;
    const positionedGeneralLane = generalLaneNodes.map((node) => {
        const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
        const y = findFreeY(generalLaneX, dimensions.width, dimensions.height, occupiedRects, nextGeneralLaneY, COLLISION_GAP);
        nextGeneralLaneY = y + dimensions.height + GENERAL_LANE_GAP_Y;
        const positionedNode: GraphNodeBase = { ...node, position: { x: generalLaneX, y } };
        occupiedRects.push({ x: generalLaneX, y, width: dimensions.width, height: dimensions.height });
        return positionedNode;
    });

    return [...positionedReferenced, ...positionedGeneralLane, ...fixedNodes];
}

function getNodeDimensions(node: GraphNodeBase, isExpanded: boolean) {
    const nodeData = (node.data ?? {}) as Record<string, unknown>;
    const nodeKind = typeof nodeData.kind === 'string' ? nodeData.kind : undefined;
    const label = typeof nodeData.label === 'string' ? nodeData.label : undefined;
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);

    return {
        width: node.type === 'customTask'
            ? (isExpanded
                ? getExpandedNodeWidth(label, nodeKind)
                : getCollapsedNodeWidth(label, nodeKind, false))
            : layoutDimensions.width,
        height: layoutDimensions.height,
    };
}

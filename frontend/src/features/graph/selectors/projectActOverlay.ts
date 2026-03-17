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

function hasStablePosition(node: GraphNodeBase) {
    return Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y);
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

        let currentY = anchorCenterY - (totalHeight / 2);

        return nodes.map((node) => {
            const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
            const positionedNode: GraphNodeBase = {
                ...node,
                position: {
                    x: baseX,
                    y: currentY,
                },
            };
            currentY += dimensions.height + SIDECAR_STACK_GAP_Y;
            return positionedNode;
        });
    });

    let currentGeneralY = GENERAL_LANE_START_Y;
    const positionedGeneralLane = generalLaneNodes.map((node) => {
        const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
        const positionedNode: GraphNodeBase = {
            ...node,
            position: {
                x: maxPersistedRight + GENERAL_LANE_OFFSET_X,
                y: currentGeneralY,
            },
        };
        currentGeneralY += dimensions.height + GENERAL_LANE_GAP_Y;
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

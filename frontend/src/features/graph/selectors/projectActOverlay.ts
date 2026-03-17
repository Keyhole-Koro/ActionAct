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
const GENERAL_LANE_START_Y = 140;
const GENERAL_LANE_GAP_Y = 36;
const COLLISION_GAP = 12;

type Rect = { x: number; y: number; width: number; height: number };

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
        // 手動配置済み、またはoverlay が一度正しく配置した位置を保持してジッターを防ぐ
        if (node.data?.isManualPosition === true || node.data?.overlayPositioned === true) {
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

    // 全Actノードを Persisted 列の右端の単一レーンに配置する。
    // アンカーを参照しているノードはアンカーのY中心に揃え、参照なしのノードは後続に積む。
    // これにより Act サイドカーが Persisted 列と重なるのを防ぐ。
    const actLaneX = maxPersistedRight + SIDECAR_OFFSET_X;

    // アンカーのY位置順に処理することで、上のアンカーに対応する Act が上に並ぶ
    const sortedBuckets = [...referencedBuckets.entries()].sort(([aId], [bId]) => {
        const a = persistedById.get(aId);
        const b = persistedById.get(bId);
        return (a?.position.y ?? 0) - (b?.position.y ?? 0);
    });

    const positionedReferenced = sortedBuckets.flatMap(([anchorId, nodes]) => {
        const anchor = persistedById.get(anchorId);
        if (!anchor) {
            return nodes;
        }

        const anchorDimensions = getNodeDimensions(anchor, expandedSet.has(anchor.id));
        const anchorCenterY = anchor.position.y + (anchorDimensions.height / 2);

        const totalHeight = nodes.reduce((sum, node, index) => {
            const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
            return sum + dimensions.height + (index > 0 ? SIDECAR_STACK_GAP_Y : 0);
        }, 0);

        const groupWidth = Math.max(...nodes.map((n) => getNodeDimensions(n, expandedSet.has(n.id)).width));
        const desiredStartY = anchorCenterY - totalHeight / 2;
        let currentY = findFreeY(actLaneX, groupWidth, totalHeight, occupiedRects, desiredStartY, COLLISION_GAP);

        return nodes.map((node) => {
            const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
            const positionedNode: GraphNodeBase = {
                ...node,
                position: { x: actLaneX, y: currentY },
                data: { ...node.data, overlayPositioned: true },
            };
            occupiedRects.push({ x: actLaneX, y: currentY, width: dimensions.width, height: dimensions.height });
            currentY += dimensions.height + SIDECAR_STACK_GAP_Y;
            return positionedNode;
        });
    });

    let nextGeneralLaneY = GENERAL_LANE_START_Y;
    const positionedGeneralLane = generalLaneNodes.map((node) => {
        const dimensions = getNodeDimensions(node, expandedSet.has(node.id));
        const y = findFreeY(actLaneX, dimensions.width, dimensions.height, occupiedRects, nextGeneralLaneY, COLLISION_GAP);
        nextGeneralLaneY = y + dimensions.height + GENERAL_LANE_GAP_Y;
        const positionedNode: GraphNodeBase = {
            ...node,
            position: { x: actLaneX, y },
            data: { ...node.data, overlayPositioned: true },
        };
        occupiedRects.push({ x: actLaneX, y, width: dimensions.width, height: dimensions.height });
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

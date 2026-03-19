import type { GraphNodeBase } from '@/features/graph/types';

type RadialLayoutParams = {
    nodes: GraphNodeBase[];
    depthById: Map<string, number>;
    rootIds: string[];
    childrenByParent: Map<string, string[]>;
};

export const RADIAL_CENTER_X = 980;
export const RADIAL_CENTER_Y = 720;
const ROOT_RADIUS = 220;
const DEPTH_RING_GAP = 270;
const ROOT_SWEEP = (Math.PI * 2) / 3.6;

export function layoutPersistedRadial({
    nodes,
    depthById,
    rootIds,
    childrenByParent,
}: RadialLayoutParams): GraphNodeBase[] {
    if (nodes.length === 0) {
        return [];
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const positionedById = new Map<string, { x: number; y: number }>();
    const rootAngleStep = (Math.PI * 2) / Math.max(rootIds.length, 1);

    rootIds.forEach((rootId, index) => {
        const startAngle = (-Math.PI / 2) + (index * rootAngleStep);
        positionSubtree({
            nodeId: rootId,
            positionedById,
            depthById,
            childrenByParent,
            angleStart: startAngle - (ROOT_SWEEP / 2),
            angleEnd: startAngle + (ROOT_SWEEP / 2),
        });
    });

    return nodes.map((node, index) => {
        const positioned = positionedById.get(node.id) ?? fallbackPosition(index);
        return {
            ...node,
            position: positioned,
        };
    });
}

function positionSubtree({
    nodeId,
    positionedById,
    depthById,
    childrenByParent,
    angleStart,
    angleEnd,
}: {
    nodeId: string;
    positionedById: Map<string, { x: number; y: number }>;
    depthById: Map<string, number>;
    childrenByParent: Map<string, string[]>;
    angleStart: number;
    angleEnd: number;
}) {
    const depth = depthById.get(nodeId) ?? 0;
    const angle = (angleStart + angleEnd) / 2;
    const radius = ROOT_RADIUS + (depth * DEPTH_RING_GAP);

    positionedById.set(nodeId, {
        x: RADIAL_CENTER_X + (Math.cos(angle) * radius),
        y: RADIAL_CENTER_Y + (Math.sin(angle) * radius),
    });

    const children = childrenByParent.get(nodeId) ?? [];
    if (children.length === 0) {
        return;
    }

    const span = angleEnd - angleStart;
    const childStep = span / children.length;

    children.forEach((childId, index) => {
        const childStart = angleStart + (childStep * index);
        const childEnd = childStart + childStep;
        positionSubtree({
            nodeId: childId,
            positionedById,
            depthById,
            childrenByParent,
            angleStart: childStart,
            angleEnd: childEnd,
        });
    });
}

function fallbackPosition(index: number) {
    return {
        x: 240 + ((index % 6) * 220),
        y: 180 + (Math.floor(index / 6) * 180),
    };
}

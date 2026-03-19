import type { GraphNodeBase } from '@/features/graph/types';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';
import type { WeightedRelationEdge } from '@/features/graph/model/relations';

type PositionedPersistedNode = GraphNodeBase;

type ForceLayoutParams = {
    nodes: GraphNodeBase[];
    edges: WeightedRelationEdge[];
    depthById: Map<string, number>;
    rootIds: string[];
    expandedNodeIds: Set<string>;
    previousPositions?: Map<string, { x: number; y: number }>;
    childrenByParent: Map<string, string[]>;
};

type ForceNode = {
    id: string;
    width: number;
    height: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    depth: number;
    rootIndex: number;
    order: number;
};

const HORIZONTAL_GAP = 560;
const VERTICAL_GAP = 240;
const ITERATIONS = 90;
const DAMPING = 0.76;
const PADDING_LEFT = 120;
const PADDING_TOP = 100;
const SIBLING_SPACING = 210;
const ROOT_CLUSTER_SPACING = 340;

export function layoutPersistedForce({
    nodes,
    edges,
    depthById,
    rootIds,
    expandedNodeIds,
    previousPositions,
    childrenByParent,
}: ForceLayoutParams): PositionedPersistedNode[] {
    if (nodes.length === 0) {
        return [];
    }

    const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
    const rootIndexById = new Map(rootIds.map((id, index) => [id, index]));
    const forceNodes = new Map<string, ForceNode>();

    for (const node of nodes) {
        const isExpanded = expandedNodeIds.has(node.id);
        const dimensions = getNodeDimensions(node, isExpanded);
        const depth = depthById.get(node.id) ?? 0;
        const rootIndex = rootIndexById.get(resolveRootId(node, depthById, rootIds)) ?? 0;
        const order = nodeOrder.get(node.id) ?? 0;
        const seed = previousPositions?.get(node.id);
        const seededX = seed?.x ?? (PADDING_LEFT + (depth * HORIZONTAL_GAP));
        const seededY = seed?.y ?? (PADDING_TOP + (order * VERTICAL_GAP));

        forceNodes.set(node.id, {
            id: node.id,
            width: dimensions.width,
            height: dimensions.height,
            x: seededX,
            y: seededY,
            vx: 0,
            vy: 0,
            depth,
            rootIndex,
            order,
        });
    }

    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        applyCharge(forceNodes);
        applyLinkForce(forceNodes, edges);
        applyHierarchyCohesion(forceNodes, childrenByParent);
        applyAxisConstraints(forceNodes, rootIds.length);
        integrate(forceNodes);
    }

    resolveColumnOverlaps(forceNodes);

    const positioned = nodes.map((node) => {
        const state = forceNodes.get(node.id)!;
        return {
            ...node,
            position: {
                x: state.x,
                y: state.y,
            },
        };
    });

    return normalizePositions(positioned);
}

function getNodeDimensions(node: GraphNodeBase, isExpanded: boolean) {
    const nodeData = (node.data ?? {}) as Record<string, unknown>;
    const nodeKind = typeof nodeData.kind === 'string' ? nodeData.kind : undefined;
    const label = typeof nodeData.label === 'string' ? nodeData.label : undefined;
    const hasChildNodes = false;
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);

    return {
        width: node.type === 'customTask'
            ? (isExpanded
                ? getExpandedNodeWidth(label, nodeKind)
                : getCollapsedNodeWidth(label, nodeKind, hasChildNodes))
            : layoutDimensions.width,
        height: layoutDimensions.height,
    };
}

function resolveRootId(node: GraphNodeBase, depthById: Map<string, number>, rootIds: string[]) {
    if ((depthById.get(node.id) ?? 0) === 0) {
        return node.id;
    }
    const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
    if (!parentId) {
        return rootIds[0] ?? node.id;
    }
    return parentId;
}

function applyCharge(nodes: Map<string, ForceNode>) {
    const values = [...nodes.values()];
    for (let i = 0; i < values.length; i += 1) {
        for (let j = i + 1; j < values.length; j += 1) {
            const left = values[i];
            const right = values[j];
            const dx = right.x - left.x;
            const dy = right.y - left.y;
            const distanceSq = Math.max((dx * dx) + (dy * dy), 1);
            const distance = Math.sqrt(distanceSq);
            const repel = Math.min(2200 / distanceSq, 1.8);
            const nx = dx / distance;
            const ny = dy / distance;

            left.vx -= nx * repel;
            left.vy -= ny * repel;
            right.vx += nx * repel;
            right.vy += ny * repel;

            const minGap = ((Math.max(left.width, left.height) + Math.max(right.width, right.height)) * 0.32);
            if (distance < minGap) {
                const push = (minGap - distance) * 0.11;
                left.vx -= nx * push;
                left.vy -= ny * push;
                right.vx += nx * push;
                right.vy += ny * push;
            }
        }
    }
}

function applyLinkForce(nodes: Map<string, ForceNode>, edges: WeightedRelationEdge[]) {
    for (const edge of edges) {
        const source = nodes.get(edge.source);
        const target = nodes.get(edge.target);
        if (!source || !target) {
            continue;
        }

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(Math.sqrt((dx * dx) + (dy * dy)), 1);
        const stretch = distance - edge.distance;
        const nx = dx / distance;
        const ny = dy / distance;
        const impulse = stretch * edge.strength;

        source.vx += nx * impulse;
        source.vy += ny * impulse;
        target.vx -= nx * impulse;
        target.vy -= ny * impulse;
    }
}

function applyHierarchyCohesion(nodes: Map<string, ForceNode>, childrenByParent: Map<string, string[]>) {
    for (const [parentId, children] of childrenByParent.entries()) {
        const parent = nodes.get(parentId);
        if (!parent || children.length === 0) {
            continue;
        }

        const presentChildren = children
            .map((childId) => nodes.get(childId))
            .filter((child): child is ForceNode => Boolean(child));

        if (presentChildren.length === 0) {
            continue;
        }

        const averageY = presentChildren.reduce((sum, child) => sum + child.y, 0) / presentChildren.length;
        parent.vy += (averageY - parent.y) * 0.028;

        presentChildren
            .sort((left, right) => left.order - right.order)
            .forEach((child, index) => {
                const targetX = parent.x + HORIZONTAL_GAP;
                const targetY = averageY + ((index - ((presentChildren.length - 1) / 2)) * SIBLING_SPACING);
                child.vx += (targetX - child.x) * 0.11;
                child.vy += (targetY - child.y) * 0.055;
            });
    }
}

function applyAxisConstraints(nodes: Map<string, ForceNode>, rootCount: number) {
    for (const node of nodes.values()) {
        const targetX = PADDING_LEFT + (node.depth * HORIZONTAL_GAP);
        const rootBias = rootCount > 1 ? node.rootIndex * ROOT_CLUSTER_SPACING : 0;
        const targetY = PADDING_TOP + (node.order * 42) + rootBias;

        node.vx += (targetX - node.x) * (node.depth === 0 ? 0.22 : 0.14);
        node.vy += (targetY - node.y) * (node.depth === 0 ? 0.09 : 0.04);
    }
}

function integrate(nodes: Map<string, ForceNode>) {
    for (const node of nodes.values()) {
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
    }
}

function resolveColumnOverlaps(nodes: Map<string, ForceNode>): void {
    const MIN_VERTICAL_GAP = 24;

    // 列（depth）ごとにグループ化
    const byDepth = new Map<number, ForceNode[]>();
    for (const node of nodes.values()) {
        const col = byDepth.get(node.depth) ?? [];
        col.push(node);
        byDepth.set(node.depth, col);
    }

    // 各列をY位置でソートし、上から順に重なりを下方向に解消
    for (const col of byDepth.values()) {
        col.sort((a, b) => a.y - b.y);
        for (let i = 1; i < col.length; i++) {
            const above = col[i - 1];
            const current = col[i];
            const minY = above.y + above.height + MIN_VERTICAL_GAP;
            if (current.y < minY) {
                current.y = minY;
            }
        }
    }
}

function normalizePositions(nodes: GraphNodeBase[]) {
    const minX = Math.min(...nodes.map((node) => node.position.x));
    const minY = Math.min(...nodes.map((node) => node.position.y));
    const offsetX = minX < PADDING_LEFT ? PADDING_LEFT - minX : 0;
    const offsetY = minY < PADDING_TOP ? PADDING_TOP - minY : 0;

    if (offsetX === 0 && offsetY === 0) {
        return nodes;
    }

    return nodes.map((node) => ({
        ...node,
        position: {
            x: node.position.x + offsetX,
            y: node.position.y + offsetY,
        },
    }));
}

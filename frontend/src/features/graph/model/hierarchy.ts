import type { GraphNodeBase } from '@/features/graph/types';

export type GraphEdgeLike = {
    id: string;
    source: string;
    target: string;
    animated?: boolean;
};

export type VisibleHierarchy = {
    rootIds: string[];
    childrenByParent: Map<string, string[]>;
    depthById: Map<string, number>;
    visibleNodeIds: Set<string>;
    visibleNodes: GraphNodeBase[];
    visibleEdges: GraphEdgeLike[];
};

export function buildVisibleHierarchy(
    persistedNodes: GraphNodeBase[],
    persistedEdges: GraphEdgeLike[],
    expandedBranchNodeIds: string[],
): VisibleHierarchy {
    const allPersistedIds = new Set(persistedNodes.map((node) => node.id));
    const childrenByParent = new Map<string, string[]>();

    for (const node of persistedNodes) {
        const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
        if (!parentId || !allPersistedIds.has(parentId)) {
            continue;
        }
        const siblings = childrenByParent.get(parentId) ?? [];
        siblings.push(node.id);
        childrenByParent.set(parentId, siblings);
    }

    const rootIds = persistedNodes
        .filter((node) => {
            const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
            return !parentId || !allPersistedIds.has(parentId);
        })
        .map((node) => node.id);

    const expandedSet = new Set(expandedBranchNodeIds);
    const visibleNodeIds = new Set<string>(rootIds);
    const queue = [...rootIds];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (!expandedSet.has(currentId)) {
            continue;
        }
        const children = childrenByParent.get(currentId) ?? [];
        for (const childId of children) {
            if (visibleNodeIds.has(childId)) {
                continue;
            }
            visibleNodeIds.add(childId);
            queue.push(childId);
        }
    }

    if (visibleNodeIds.size === 0) {
        for (const node of persistedNodes) {
            visibleNodeIds.add(node.id);
        }
    }

    const depthById = new Map<string, number>();
    const depthQueue = rootIds.map((nodeId) => ({ nodeId, depth: 0 }));
    while (depthQueue.length > 0) {
        const { nodeId, depth } = depthQueue.shift()!;
        if (depthById.has(nodeId)) {
            continue;
        }
        depthById.set(nodeId, depth);
        const children = childrenByParent.get(nodeId) ?? [];
        for (const childId of children) {
            if (!visibleNodeIds.has(childId)) {
                continue;
            }
            depthQueue.push({ nodeId: childId, depth: depth + 1 });
        }
    }

    return {
        rootIds,
        childrenByParent,
        depthById,
        visibleNodeIds,
        visibleNodes: persistedNodes.filter((node) => visibleNodeIds.has(node.id)),
        visibleEdges: persistedEdges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
    };
}

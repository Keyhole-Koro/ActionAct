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
    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const currentId = queue[queueIndex++]!;
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

    // Fallback 1: nothing visible at all → show everything
    if (visibleNodeIds.size === 0) {
        for (const node of persistedNodes) {
            visibleNodeIds.add(node.id);
        }
    }

    // Fallback 2: only root nodes are visible but they all have children and none are
    // expanded — this typically means expandedBranchNodeIds was unexpectedly cleared.
    // Show the first level of children so the graph doesn't appear empty.
    const onlyRootsVisible = visibleNodeIds.size === rootIds.length
        && rootIds.every((id) => visibleNodeIds.has(id));
    const hasHiddenChildren = rootIds.some((id) => (childrenByParent.get(id) ?? []).length > 0);
    if (onlyRootsVisible && hasHiddenChildren && expandedBranchNodeIds.length === 0) {
        for (const rootId of rootIds) {
            for (const childId of childrenByParent.get(rootId) ?? []) {
                visibleNodeIds.add(childId);
            }
        }
    }

    const depthById = new Map<string, number>();
    const depthQueue = rootIds.map((nodeId) => ({ nodeId, depth: 0 }));
    let depthQueueIndex = 0;
    while (depthQueueIndex < depthQueue.length) {
        const { nodeId, depth } = depthQueue[depthQueueIndex++]!;
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

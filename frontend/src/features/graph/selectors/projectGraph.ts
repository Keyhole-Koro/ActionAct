import type { Node } from '@xyflow/react';

import type { GraphNodeBase, GraphNodeRender, GraphNodeRenderData, ReferencedNodeView } from '@/features/graph/types';

type PersistedTreeProjection = {
    childrenByParent: Map<string, string[]>;
    visibleNodeIds: Set<string>;
    visibleNodes: GraphNodeBase[];
    visibleEdges: { id: string; source: string; target: string; animated?: boolean }[];
};

export function buildVisibleTree(
    persistedNodes: GraphNodeBase[],
    persistedEdges: { id: string; source: string; target: string; animated?: boolean }[],
    expandedBranchNodeIds: string[],
): PersistedTreeProjection {
    const childrenByParent = new Map<string, string[]>();
    persistedEdges.forEach((edge) => {
        const children = childrenByParent.get(edge.source) ?? [];
        children.push(edge.target);
        childrenByParent.set(edge.source, children);
    });

    const allPersistedIds = new Set(persistedNodes.map((node) => node.id));
    const expandedSet = new Set(expandedBranchNodeIds);

    // Root detection: use parentId from node data, not edge inference.
    // A node is root if it has no parentId, or its parentId doesn't exist in the node set.
    const rootIds = persistedNodes
        .filter((node) => {
            const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
            return !parentId || !allPersistedIds.has(parentId);
        })
        .map((node) => node.id);

    const visibleNodeIds = new Set(rootIds);
    const queue = [...rootIds];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (!expandedSet.has(currentId)) {
            continue;
        }

        const children = childrenByParent.get(currentId) ?? [];
        children.forEach((childId) => {
            if (!allPersistedIds.has(childId) || visibleNodeIds.has(childId)) {
                return;
            }
            visibleNodeIds.add(childId);
            queue.push(childId);
        });
    }

    if (visibleNodeIds.size === 0) {
        persistedNodes.forEach((node) => visibleNodeIds.add(node.id));
    }

    return {
        childrenByParent,
        visibleNodeIds,
        visibleNodes: persistedNodes.filter((node) => visibleNodeIds.has(node.id)),
        visibleEdges: persistedEdges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)),
    };
}

export const projectPersistedTree = buildVisibleTree;

export function mergeTreeWithActNodes(
    visiblePersistedNodes: GraphNodeBase[],
    persistedNodes: GraphNodeBase[],
    actNodes: GraphNodeBase[],
) {
    const actNodesById = new Map(actNodes.map((node) => [node.id, node]));
    const mergedTreeNodes = visiblePersistedNodes.map((node) => {
        const draftNode = actNodesById.get(node.id);
        if (!draftNode) {
            return node;
        }
        // Merge act data but preserve persisted kind to prevent
        // act draft's "act" kind from overwriting persisted "claim"/"cluster" etc.
        const { kind: _actKind, ...draftDataWithoutKind } = draftNode.data ?? {};
        return {
            ...node,
            position: draftNode.position ?? node.position,
            data: {
                ...node.data,
                ...draftDataWithoutKind,
            },
        };
    });

    const persistedIdSet = new Set(persistedNodes.map((node) => node.id));
    const standaloneActNodes = actNodes.filter((actNode) => !persistedIdSet.has(actNode.id));
    return { mergedTreeNodes, standaloneActNodes };
}

export function buildLayoutInput(
    mergedTreeNodes: GraphNodeBase[],
    visibleEdges: { id: string; source: string; target: string; animated?: boolean }[],
) {
    return {
        layoutInputNodes: [...mergedTreeNodes],
        layoutInputEdges: [...visibleEdges],
    };
}

export function resolveReferencedNodes(
    referencedNodeIds: string[] | undefined,
    allNodes: Node[],
): ReferencedNodeView[] {
    if (!referencedNodeIds || referencedNodeIds.length === 0) {
        return [];
    }

    return referencedNodeIds.map((nodeId) => {
        const matched = allNodes.find((node) => node.id === nodeId);
        const label = typeof matched?.data?.label === 'string' && matched.data.label.trim()
            ? matched.data.label
            : nodeId;
        return { id: nodeId, label };
    });
}

type BuildDisplayNodesParams = {
    layoutInputNodes: GraphNodeBase[];
    standaloneActNodes: GraphNodeBase[];
    layoutedNodes: Node[];
    manualNodeIds: string[];
    selectedNodeIds: string[];
    expandedBranchNodeIds: string[];
    visiblePersistedNodeIds: Set<string>;
    childrenByParent: Map<string, string[]>;
    allReferenceableNodes: Node[];
    isNodeExpanded: (nodeId: string) => boolean;
    isNodeEditing: (nodeId: string) => boolean;
    isNodeStreaming: (nodeId: string) => boolean;
    onToggleBranch: (nodeId: string) => void;
    onOpenDetails: (nodeId: string) => void;
    onOpenReferencedNode: (nodeId: string) => void;
    onCommitLabel: (nodeId: string, label: string) => void;
    onRunAction: (nodeId: string, label: string) => void;
};

export function buildDisplayNodes({
    layoutInputNodes,
    standaloneActNodes,
    layoutedNodes,
    manualNodeIds,
    selectedNodeIds,
    expandedBranchNodeIds,
    visiblePersistedNodeIds,
    childrenByParent,
    allReferenceableNodes,
    isNodeExpanded,
    isNodeEditing,
    isNodeStreaming,
    onToggleBranch,
    onOpenDetails,
    onOpenReferencedNode,
    onCommitLabel,
    onRunAction,
}: BuildDisplayNodesParams): GraphNodeRender[] {
    const layoutById = new Map(layoutedNodes.map((node) => [node.id, node]));
    const maxTreeX = layoutedNodes.reduce((max, node) => Math.max(max, node.position.x), 0);
    const standaloneActNodesById = new Map(standaloneActNodes.map((node) => [node.id, node]));

    // Convert arrays to Sets for O(1) lookup
    const manualNodeIdSet = new Set(manualNodeIds);
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const expandedBranchSet = new Set(expandedBranchNodeIds);

    const actLaneNodes = standaloneActNodes.map((node, index) => {
        const layoutedNode = layoutById.get(node.id);
        const sourceNode = layoutedNode ?? node;
        return {
            ...sourceNode,
            position: {
                x: maxTreeX + 420,
                y: sourceNode.position.y + (index * 220),
            },
        };
    });

    const combinedNodes = [...layoutInputNodes, ...actLaneNodes];

    return combinedNodes.map((node) => {
        const layoutedNode = layoutById.get(node.id);
        const mergedNode = standaloneActNodesById.has(node.id)
            ? node
            : !layoutedNode
                ? node
                : {
                    ...node,
                    position: layoutedNode.position,
                    sourcePosition: layoutedNode.sourcePosition,
                    targetPosition: layoutedNode.targetPosition,
                };

        const hasChildNodes = childrenByParent.has(node.id);
        const hiddenChildCount = (childrenByParent.get(node.id) ?? []).filter((childId) => !visiblePersistedNodeIds.has(childId)).length;
        const referencedNodeIds = Array.isArray(mergedNode.data?.referencedNodeIds)
            ? mergedNode.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
            : [];

        const renderData: GraphNodeRenderData = {
            ...(mergedNode.data as GraphNodeRenderData),
            ...(manualNodeIdSet.has(node.id) ? { isManualPosition: true } : {}),
            referencedNodes: resolveReferencedNodes(referencedNodeIds, allReferenceableNodes),
            hasChildNodes,
            branchExpanded: expandedBranchSet.has(node.id),
            hiddenChildCount,
            isExpanded: isNodeExpanded(node.id),
            isEditing: isNodeEditing(node.id),
            isStreaming: isNodeStreaming(node.id),
            onToggleBranch: hasChildNodes ? () => onToggleBranch(node.id) : undefined,
            onOpenDetails: () => onOpenDetails(node.id),
            onOpenReferencedNode: (referencedNodeId: string) => onOpenReferencedNode(referencedNodeId),
            onCommitLabel: (label: string) => onCommitLabel(node.id, label),
            onRunAction: (label: string) => onRunAction(node.id, label),
        };

        return {
            ...mergedNode,
            selected: selectedNodeIdSet.has(node.id),
            data: renderData,
        };
    });
}

export function buildDisplayEdges(
    layoutedEdges: { id: string; source: string; target: string; animated?: boolean }[],
    fallbackLayoutEdges: { id: string; source: string; target: string; animated?: boolean }[],
    actEdges: { id: string; source: string; target: string; animated?: boolean }[],
    selectionOverlayEdges: { id: string; source: string; target: string; animated?: boolean }[],
) {
    return [
        ...(layoutedEdges.length > 0 ? layoutedEdges : fallbackLayoutEdges),
        ...actEdges,
        ...selectionOverlayEdges,
    ];
}

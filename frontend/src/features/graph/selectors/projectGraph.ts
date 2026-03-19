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
    const rootIds = persistedNodes
        .filter((node) => {
            const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
            return !parentId || !allPersistedIds.has(parentId);
        })
        .map((node) => node.id);

    const visibleNodeIds = new Set(rootIds);
    const queue = [...rootIds];

    while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || !expandedSet.has(currentId)) {
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

export function resolveReferencedNodes(
    referencedNodeIds: string[] | undefined,
    nodeById: Map<string, Node>,
): ReferencedNodeView[] {
    if (!referencedNodeIds || referencedNodeIds.length === 0) {
        return [];
    }

    return referencedNodeIds.map((nodeId) => {
        const matched = nodeById.get(nodeId);
        const label = typeof matched?.data?.label === 'string' && matched.data.label.trim().length > 0
            ? matched.data.label
            : nodeId;
        return { id: nodeId, label };
    });
}

type BuildDisplayNodesParams = {
    nodes: GraphNodeBase[];
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
    onUpdateLabel: (nodeId: string, label: string) => void;
    onRunAction: (nodeId: string, label: string) => void;
    onAddMedia: (nodeId: string, file: File) => Promise<void> | void;
};

export function buildDisplayNodes({
    nodes,
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
    onAddMedia,
}: BuildDisplayNodesParams): GraphNodeRender[] {
    const referenceableNodeById = new Map(allReferenceableNodes.map((node) => [node.id, node]));
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const expandedBranchSet = new Set(expandedBranchNodeIds);

    return nodes.map((node) => {
        const hasChildNodes = childrenByParent.has(node.id);
        const hiddenChildCount = (childrenByParent.get(node.id) ?? []).filter((childId) => !visiblePersistedNodeIds.has(childId)).length;
        const nodeData = (node.data ?? {}) as Record<string, unknown>;
        const referencedNodeIds = Array.isArray(nodeData.referencedNodeIds)
            ? nodeData.referencedNodeIds.filter((value): value is string => typeof value === 'string')
            : [];
        const hasResolvedActContent = [
            nodeData.contentMd,
            nodeData.contextSummary,
            nodeData.detailHtml,
        ].some((value) => typeof value === 'string' && value.trim().length > 0);
        const actStage = nodeData.kind === 'act'
            ? (isNodeStreaming(node.id) ? 'thinking' : (hasResolvedActContent ? 'ready' : 'draft'))
            : undefined;

        const renderData: GraphNodeRenderData = {
            ...(node.data as GraphNodeRenderData),
            actStage,
            referencedNodes: resolveReferencedNodes(referencedNodeIds, referenceableNodeById),
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
            onUpdateLabel: (label: string) => onUpdateLabel(node.id, label),
            onRunAction: (label: string) => onRunAction(node.id, label),
            onAddMedia: (file: File) => onAddMedia(node.id, file),
        };

        return {
            ...node,
            selected: selectedNodeIdSet.has(node.id),
            style: {
                ...(node.style ?? {}),
                opacity: 1,
                visibility: 'visible',
                pointerEvents: 'all',
            },
            data: renderData,
        };
    });
}

export function buildDisplayEdges(
    visibleEdges: { id: string; source: string; target: string; animated?: boolean }[],
    actEdges: { id: string; source: string; target: string; animated?: boolean }[],
) {
    const deduped = new Map<string, { id: string; source: string; target: string; animated?: boolean }>();

    [...visibleEdges, ...actEdges].forEach((edge) => {
        deduped.set(edge.id, edge);
    });

    return [...deduped.values()];
}

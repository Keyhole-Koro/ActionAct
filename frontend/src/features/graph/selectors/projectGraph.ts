import type { Node } from '@xyflow/react';

import type { GraphNodeBase, GraphNodeRender, GraphNodeRenderData, ReferencedNodeView } from '@/features/graph/types';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '@/features/graph/constants/nodeDimensions';

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

function getNodeDimensions(node: Node, isExpandedOverride?: boolean) {
    const nodeData = (node.data ?? {}) as Record<string, unknown>;
    const isExpanded = isExpandedOverride ?? (nodeData.isExpanded === true);
    const nodeKind = typeof nodeData.kind === 'string' ? nodeData.kind : undefined;
    const label = typeof nodeData.label === 'string' ? nodeData.label : undefined;
    const hasChildNodes = nodeData.hasChildNodes === true;
    const layoutDimensions = getLayoutDimensionsForNodeType(node.type, isExpanded, nodeKind);

    return {
        width: node.type === 'customTask'
            ? (isExpanded ? getExpandedNodeWidth(label, nodeKind) : getCollapsedNodeWidth(label, nodeKind, hasChildNodes))
            : layoutDimensions.width,
        height: layoutDimensions.height,
    };
}

function getNodeRight(node: Node, isExpandedOverride?: boolean) {
    const dimensions = getNodeDimensions(node, isExpandedOverride);
    return node.position.x + dimensions.width;
}

function getNodeCenterY(node: Node, isExpandedOverride?: boolean) {
    const dimensions = getNodeDimensions(node, isExpandedOverride);
    return node.position.y + dimensions.height / 2;
}

type ActClusterNode = {
    node: GraphNodeBase;
    sourceNode: Node;
    isExpanded: boolean;
    width: number;
    height: number;
};

type ActCluster = {
    key: string;
    nodes: ActClusterNode[];
    preferredX: number;
    preferredTop: number;
    width: number;
    height: number;
    hasAnchors: boolean;
};

type PositionedActNodeSets = {
    positionedLaneNodes: Node[];
    positionedManualNodes: Node[];
};

const actLayoutCache = new Map<string, PositionedActNodeSets>();

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
    return !(endA <= startB || endB <= startA);
}

function layoutActClusterDagreStyle(cluster: ActCluster) {
    const clusterGapY = 28;
    let currentY = cluster.preferredTop;
    let maxWidth = 0;

    const positionedNodes = cluster.nodes.map((entry) => {
        const positionedNode = {
            ...entry.sourceNode,
            data: {
                ...(entry.sourceNode.data ?? {}),
                isExpanded: entry.isExpanded,
            },
            position: {
                x: cluster.preferredX,
                y: currentY,
            },
        };

        currentY += entry.height + clusterGapY;
        maxWidth = Math.max(maxWidth, entry.width);
        return positionedNode;
    });

    return {
        nodes: positionedNodes,
        width: maxWidth,
        height: Math.max(0, currentY - cluster.preferredTop - clusterGapY),
    };
}

export function mergeTreeWithActNodes(
    visiblePersistedNodes: GraphNodeBase[],
    _persistedNodes: GraphNodeBase[],
    actNodes: GraphNodeBase[],
) {
    return {
        mergedTreeNodes: visiblePersistedNodes,
        standaloneActNodes: actNodes,
    };
}

export function buildLayoutInput(
    mergedTreeNodes: GraphNodeBase[],
    visibleEdges: { id: string; source: string; target: string; animated?: boolean }[],
    expandedNodeIds: string[],
) {
    const expandedNodeIdSet = new Set(expandedNodeIds);
    return {
        layoutInputNodes: mergedTreeNodes.map((node) => ({
            ...node,
            data: {
                ...node.data,
                isExpanded: expandedNodeIdSet.has(node.id),
            },
        })),
        layoutInputEdges: [...visibleEdges],
    };
}

export function resolveReferencedNodes(
    referencedNodeIds: string[] | undefined,
    nodeById: Map<string, Node>,
): ReferencedNodeView[] {
    if (!referencedNodeIds || referencedNodeIds.length === 0) {
        return [];
    }

    return referencedNodeIds.map((nodeId) => {
        const matched = nodeById.get(nodeId);
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
    onAddMedia: (nodeId: string, file: File) => Promise<void> | void;
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
    onAddMedia,
}: BuildDisplayNodesParams): GraphNodeRender[] {
    const layoutById = new Map(layoutedNodes.map((node) => [node.id, node]));
    const referenceableNodeById = new Map(allReferenceableNodes.map((node) => [node.id, node]));
    const maxTreeRight = layoutedNodes.reduce((max, node) => Math.max(max, getNodeRight(node)), 0);
    const standaloneActNodesById = new Map(standaloneActNodes.map((node) => [node.id, node]));

    // Convert arrays to Sets for O(1) lookup
    const manualNodeIdSet = new Set(manualNodeIds);
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const expandedBranchSet = new Set(expandedBranchNodeIds);

    const manualActNodes: GraphNodeBase[] = [];
    const laneActNodes: GraphNodeBase[] = [];

    standaloneActNodes.forEach((node) => {
        if (node.data?.isManualPosition || manualNodeIdSet.has(node.id)) {
            manualActNodes.push(node);
        } else {
            laneActNodes.push(node);
        }
    });

    const actLayoutSignature = JSON.stringify({
        treeBounds: layoutedNodes.map((node) => ({
            id: node.id,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
            expanded: isNodeExpanded(node.id),
        })),
        laneNodes: laneActNodes.map((node) => ({
            id: node.id,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
            refs: Array.isArray(node.data?.referencedNodeIds) ? node.data.referencedNodeIds : [],
            expanded: isNodeExpanded(node.id),
        })),
        manualNodes: manualActNodes.map((node) => ({
            id: node.id,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
            expanded: isNodeExpanded(node.id),
        })),
    });

    let positionedActSets = actLayoutCache.get(actLayoutSignature);
    if (!positionedActSets) {
        const fallbackLaneX = maxTreeRight + 280;
        const fallbackLaneYStart = 100;
        const clusterLaneGapX = 56;
        const clusterGapY = 28;
        const sortedLaneNodes = [...laneActNodes].sort((left, right) => {
            const leftRefs = Array.isArray(left.data?.referencedNodeIds) ? left.data.referencedNodeIds.length : 0;
            const rightRefs = Array.isArray(right.data?.referencedNodeIds) ? right.data.referencedNodeIds.length : 0;
            if (leftRefs !== rightRefs) {
                return rightRefs - leftRefs;
            }
            if (left.position.y !== right.position.y) {
                return left.position.y - right.position.y;
            }
            return left.id.localeCompare(right.id);
        });
        const actClustersByKey = new Map<string, ActCluster>();
        sortedLaneNodes.forEach((node) => {
            const layoutedNode = layoutById.get(node.id);
            const sourceNode = layoutedNode ?? node;
            const sourceNodeData = (sourceNode.data ?? {}) as Record<string, unknown>;
            const isExpanded = sourceNodeData.isExpanded === true || isNodeExpanded(node.id);
            const dimensions = getNodeDimensions(sourceNode, isExpanded);
            const referencedNodeIds = Array.isArray(node.data?.referencedNodeIds)
                ? node.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
                : [];
            const anchorNodes = referencedNodeIds
                .map((nodeId) => layoutById.get(nodeId))
                .filter((anchorNode): anchorNode is Node => Boolean(anchorNode));
            const anchorKey = anchorNodes.length > 0
                ? anchorNodes.map((anchorNode) => anchorNode.id).sort().join('|')
                : `fallback:${node.id}`;
            const preferredX = anchorNodes.length > 0
                ? Math.max(...anchorNodes.map((anchorNode) => getNodeRight(anchorNode))) + 120
                : fallbackLaneX;
            const preferredCenterY = anchorNodes.length > 0
                ? anchorNodes.reduce((sum, anchorNode) => sum + getNodeCenterY(anchorNode), 0) / anchorNodes.length
                : fallbackLaneYStart + dimensions.height / 2;
            const preferredTop = Math.max(40, Math.round(preferredCenterY - dimensions.height / 2));
            const existingCluster = actClustersByKey.get(anchorKey);
            const entry: ActClusterNode = {
                node,
                sourceNode,
                isExpanded,
                width: dimensions.width,
                height: dimensions.height,
            };

            if (!existingCluster) {
                actClustersByKey.set(anchorKey, {
                    key: anchorKey,
                    nodes: [entry],
                    preferredX,
                    preferredTop,
                    width: dimensions.width,
                    height: dimensions.height,
                    hasAnchors: anchorNodes.length > 0,
                });
                return;
            }

            existingCluster.nodes.push(entry);
            existingCluster.preferredX = Math.max(existingCluster.preferredX, preferredX);
            existingCluster.preferredTop = Math.min(existingCluster.preferredTop, preferredTop);
            existingCluster.width = Math.max(existingCluster.width, dimensions.width);
            existingCluster.height += dimensions.height + clusterGapY;
        });

        const sortedClusters = [...actClustersByKey.values()].sort((left, right) => {
            if (left.hasAnchors !== right.hasAnchors) {
                return left.hasAnchors ? -1 : 1;
            }
            if (left.preferredX !== right.preferredX) {
                return left.preferredX - right.preferredX;
            }
            return left.preferredTop - right.preferredTop;
        });

        const placedClusterBounds: Array<{ left: number; right: number; top: number; bottom: number }> = [];
        let fallbackClusterY = fallbackLaneYStart;
        const positionedLaneNodes = sortedClusters.flatMap((cluster) => {
            const baseTop = cluster.hasAnchors ? cluster.preferredTop : fallbackClusterY;
            const laidOutCluster = layoutActClusterDagreStyle({
                ...cluster,
                preferredTop: baseTop,
            });
            const clusterLeft = cluster.preferredX;
            const clusterRight = cluster.preferredX + laidOutCluster.width;
            let clusterTop = baseTop;
            let moved = true;

            while (moved) {
                moved = false;
                for (const bounds of placedClusterBounds) {
                    if (
                        rangesOverlap(clusterLeft - clusterLaneGapX, clusterRight + clusterLaneGapX, bounds.left, bounds.right)
                        && rangesOverlap(clusterTop, clusterTop + laidOutCluster.height, bounds.top, bounds.bottom)
                    ) {
                        clusterTop = bounds.bottom + clusterGapY;
                        moved = true;
                    }
                }
            }

            const yOffset = clusterTop - baseTop;
            const positionedNodes = laidOutCluster.nodes.map((positionedNode) => ({
                ...positionedNode,
                position: {
                    x: positionedNode.position.x,
                    y: positionedNode.position.y + yOffset,
                },
            }));

            placedClusterBounds.push({
                left: clusterLeft,
                right: clusterRight,
                top: clusterTop,
                bottom: clusterTop + laidOutCluster.height,
            });

            if (!cluster.hasAnchors) {
                fallbackClusterY = clusterTop + laidOutCluster.height + clusterGapY;
            }

            return positionedNodes;
        });

        const positionedManualNodes = manualActNodes.map((node) => {
            const layoutedNode = layoutById.get(node.id);
            const sourceNode = layoutedNode ?? node;
            const sourceNodeData = (sourceNode.data ?? {}) as Record<string, unknown>;
            const isExpanded = sourceNodeData.isExpanded === true || isNodeExpanded(node.id);
            return {
                ...sourceNode,
                data: {
                    ...sourceNodeData,
                    isExpanded,
                },
            };
        });

        positionedActSets = { positionedLaneNodes, positionedManualNodes };
        actLayoutCache.set(actLayoutSignature, positionedActSets);
        if (actLayoutCache.size > 24) {
            const oldestKey = actLayoutCache.keys().next().value;
            if (oldestKey) {
                actLayoutCache.delete(oldestKey);
            }
        }
    }

    const combinedNodes = [
        ...layoutInputNodes,
        ...positionedActSets.positionedLaneNodes,
        ...positionedActSets.positionedManualNodes,
    ];

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
        const mergedNodeData = (mergedNode.data ?? {}) as Record<string, unknown>;
        const referencedNodeIds = Array.isArray(mergedNodeData.referencedNodeIds)
            ? mergedNodeData.referencedNodeIds.filter((value): value is string => typeof value === 'string')
            : [];
        const hasResolvedActContent = [
            mergedNodeData.contentMd,
            mergedNodeData.contextSummary,
            mergedNodeData.detailHtml,
        ].some((value) => typeof value === 'string' && value.trim().length > 0);
        const actStage = mergedNodeData.kind === 'act'
            ? (isNodeStreaming(node.id) ? 'thinking' : (hasResolvedActContent ? 'ready' : 'draft'))
            : undefined;

        const renderData: GraphNodeRenderData = {
            ...(mergedNode.data as GraphNodeRenderData),
            ...(manualNodeIdSet.has(node.id) ? { isManualPosition: true } : {}),
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
            onRunAction: (label: string) => onRunAction(node.id, label),
            onAddMedia: (file: File) => onAddMedia(node.id, file),
        };

        return {
            ...mergedNode,
            selected: selectedNodeIdSet.has(node.id),
            style: {
                ...(mergedNode.style ?? {}),
                opacity: 1,
                visibility: 'visible',
                zIndex: 50,
                pointerEvents: 'all',
            },
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
    const mergedEdges = [
        ...(layoutedEdges.length > 0 ? layoutedEdges : fallbackLayoutEdges),
        ...actEdges,
        ...selectionOverlayEdges,
    ];

    const deduped = new Map<string, { id: string; source: string; target: string; animated?: boolean }>();
    mergedEdges.forEach((edge) => {
        deduped.set(edge.id, edge);
    });

    return [...deduped.values()];
}

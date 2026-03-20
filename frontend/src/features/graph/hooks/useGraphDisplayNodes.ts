import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Node } from '@xyflow/react';
import { getAuth } from 'firebase/auth';
import { useReactFlow } from '@xyflow/react';
import { organizeService } from '@/services/organize';
import { upsertActNodeDraft } from '@/features/graph/runtime/act-graph-actions';
import { buildDisplayNodes } from '../selectors/projectGraph';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import { getDisplayNodeDimensions, isRenderableCoordinate } from '../components/graphCanvas/graphCanvasUtils';
import type { GraphNodeBase } from '../types';
import type { useGraphCommands } from './useGraphCommands';

const RADIAL_ROOT_HUES = [198, 256, 148, 34, 320, 82, 12, 228];
const OVERLAP_CELL_SIZE = 320;

interface UseGraphDisplayNodesOptions {
    regularGraphNodes: GraphNodeBase[];
    selectionProjectionNodes: Node[];
    selectedNodeIds: string[];
    expandedBranchNodeIds: string[];
    expandedNodeIds: string[];
    editingNodeId: string | null;
    streamingNodeIds: string[];
    activeNodeId: string | null;
    actNodes: GraphNodeBase[];
    persistedGraph: ReturnType<typeof projectPersistedGraph>;
    radialOverviewGraph: ReturnType<typeof projectPersistedGraph>;
    allReferenceableNodes: GraphNodeBase[];
    fullActNodeDataById: Map<string, GraphNodeBase['data']>;
    actChildrenByParent: Map<string, string[]>;
    persistedRootIdByNode: Map<string, string>;
    isRadialLayout: boolean;
    nodeLastUsedAt: Record<string, number>;
    nodeUseCount: Record<string, number>;
    briefGeneratingNodeIds: Set<string>;
    customNodeSizes: Map<string, { width: number; height: number }>;
    effectiveWorkspaceId: string | undefined | null;
    workspaceId: string | undefined | null;
    commands: ReturnType<typeof useGraphCommands>;
    addQueryActNode: (position: { x: number; y: number }, label: string, options?: { isManualPosition?: boolean }) => string;
    toggleExpandedNode: (nodeId: string) => void;
    handleNodeResize: (nodeId: string, width: number, height: number) => void;
}

interface UseGraphDisplayNodesResult {
    displayNodes: ReturnType<typeof buildDisplayNodes>;
    briefGeneratingNodeIds: Set<string>;
    canvasNodes: Node[];
    persistedRootIdByNode: Map<string, string>;
    activeDescendantIds: Set<string>;
    layoutAwareDisplayNodes: Node[];
    radialOverviewNodes: Node[];
    radialOverviewNodeById: Map<string, Node>;
    normalizedDisplayNodes: Node[];
    emphasizedDisplayNodes: Node[];
    actTreeGroupNodes: Node[];
    handleGenerateBrief: (nodeId: string, nodePosition: { x: number; y: number }) => void;
    handleNavigateToActNode: (nodeId: string) => void;
}

export function useGraphDisplayNodes({
    regularGraphNodes,
    selectionProjectionNodes,
    selectedNodeIds,
    expandedBranchNodeIds,
    expandedNodeIds,
    editingNodeId,
    streamingNodeIds,
    activeNodeId,
    actNodes,
    persistedGraph,
    radialOverviewGraph,
    allReferenceableNodes,
    fullActNodeDataById,
    actChildrenByParent,
    persistedRootIdByNode,
    isRadialLayout,
    nodeLastUsedAt,
    nodeUseCount,
    briefGeneratingNodeIds,
    customNodeSizes,
    effectiveWorkspaceId,
    workspaceId,
    commands,
    addQueryActNode,
    toggleExpandedNode,
    handleNodeResize,
}: UseGraphDisplayNodesOptions): UseGraphDisplayNodesResult {
    const reactFlowInstance = useReactFlow();
    const expandedNodeIdSet = useMemo(() => new Set(expandedNodeIds), [expandedNodeIds]);
    const streamingNodeIdSet = useMemo(() => new Set(streamingNodeIds), [streamingNodeIds]);
    const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const rootIdToIndex = useMemo(
        () => new Map(persistedGraph.rootIds.map((id, index) => [id, index])),
        [persistedGraph.rootIds],
    );

    const handleGenerateBrief = useCallback((nodeId: string, nodePosition: { x: number; y: number }) => {
        if (!effectiveWorkspaceId) return;
        const myUid = getAuth().currentUser?.uid;

        const actId = addQueryActNode(
            { x: nodePosition.x + 420, y: nodePosition.y },
            '',
            { isManualPosition: true },
        );
        void upsertActNodeDraft(effectiveWorkspaceId, actId, {
            referencedNodeIds: [nodeId],
            kind: 'brief',
            createdBy: 'user',
            authorUid: myUid,
        });
    }, [addQueryActNode, effectiveWorkspaceId]);

    // Write completed brief act content back to the persisted node's contextSummary
    const appliedBriefActIds = useRef(new Set<string>());
    useEffect(() => {
        for (const actNode of actNodes as GraphNodeBase[]) {
            if (actNode.data?.kind !== 'brief') continue;
            if (!actNode.data?.contentMd) continue;
            if (appliedBriefActIds.current.has(actNode.id)) continue;
            const refs = actNode.data?.referencedNodeIds;
            const targetNodeId = Array.isArray(refs) && typeof refs[0] === 'string' ? refs[0] : null;
            if (!targetNodeId || !workspaceId) continue;
            appliedBriefActIds.current.add(actNode.id);
            void organizeService.updateNodeSummary(workspaceId, targetNodeId, actNode.data.contentMd);
        }
    }, [actNodes, workspaceId]);

    const displayNodes = useMemo(
        () => buildDisplayNodes({
            nodes: regularGraphNodes,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: persistedGraph.visibleNodeIds,
            childrenByParent: persistedGraph.childrenByParent,
            allReferenceableNodes,
            isNodeExpanded: (nodeId) => expandedNodeIdSet.has(nodeId),
            isNodeEditing: (nodeId) => editingNodeId === nodeId,
            isNodeStreaming: (nodeId) => streamingNodeIdSet.has(nodeId),
            onToggleBranch: commands.toggleBranch,
            onOpenDetails: commands.openDetails,
            onOpenReferencedNode: commands.openReferencedNode,
            onCommitLabel: (nodeId, label) => {
                void commands.commitActNodeLabel(nodeId, label);
            },
            onUpdateLabel: (nodeId, label) => {
                void commands.persistActNodeLabel(nodeId, label);
            },
            onRunAction: commands.runActFromNode,
            onAddMedia: (nodeId, file) => commands.addMediaContext(nodeId, file),
        }),
        [
            allReferenceableNodes,
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIdSet,
            persistedGraph.childrenByParent,
            persistedGraph.visibleNodeIds,
            regularGraphNodes,
            selectedNodeIds,
            streamingNodeIdSet,
        ],
    );

    const canvasNodes = useMemo(
        () => [
            ...displayNodes.map((node) => {
                const customSize = customNodeSizes.get(node.id);
                const extraData: Record<string, unknown> = {
                    onResize: (w: number, h: number) => handleNodeResize(node.id, w, h),
                    ...(customSize !== undefined ? { customWidth: customSize.width, customHeight: customSize.height } : {}),
                    ...(node.data.nodeSource === 'persisted' && node.data.kind === 'topic' ? {
                        briefGenerating: briefGeneratingNodeIds.has(node.id),
                        onGenerateBrief: () => handleGenerateBrief(node.id, node.position),
                    } : {}),
                };
                return { ...node, data: { ...node.data, ...extraData } };
            }),
            ...selectionProjectionNodes,
        ],
        [briefGeneratingNodeIds, customNodeSizes, displayNodes, handleGenerateBrief, handleNodeResize, selectionProjectionNodes],
    );

    // Descendants of activeNodeId (via parentId chain) for relation highlighting.
    const activeDescendantIds = useMemo(() => {
        if (!activeNodeId) return new Set<string>();
        const childrenByParent = new Map<string, string[]>();
        for (const [id, data] of fullActNodeDataById) {
            const parentId = typeof data?.parentId === 'string' ? data.parentId : undefined;
            if (parentId) {
                const arr = childrenByParent.get(parentId) ?? [];
                arr.push(id);
                childrenByParent.set(parentId, arr);
            }
        }
        const descendants = new Set<string>();
        const queue = [activeNodeId];
        let queueIndex = 0;
        while (queueIndex < queue.length) {
            const cur = queue[queueIndex++]!;
            for (const child of childrenByParent.get(cur) ?? []) {
                if (!descendants.has(child)) {
                    descendants.add(child);
                    queue.push(child);
                }
            }
        }
        return descendants;
    }, [activeNodeId, fullActNodeDataById]);

    // Navigate to an act node: expand it if collapsed, then pan camera to it.
    const handleNavigateToActNode = useCallback((nodeId: string) => {
        if (!expandedNodeIdSet.has(nodeId)) {
            toggleExpandedNode(nodeId);
        }
        const target = reactFlowInstance.getNode(nodeId);
        if (target) {
            reactFlowInstance.setCenter(
                target.position.x + 130,
                target.position.y + 80,
                { zoom: Math.max(reactFlowInstance.getZoom(), 1.0), duration: 450 },
            );
        }
    }, [expandedNodeIdSet, reactFlowInstance, toggleExpandedNode]);

    const layoutAwareDisplayNodes = useMemo(() => {
        const now = Date.now();
        const RECENCY_HALF_LIFE_MS = 20 * 60 * 1000;
        const FREQ_K = 4;

        return canvasNodes.map((node) => {
            const layoutMode: 'radial' | undefined = isRadialLayout && node.data?.nodeSource === 'persisted'
                ? 'radial'
                : undefined;

            let rootHue = 210;
            if (node.data?.nodeSource === 'persisted') {
                const rootId = persistedRootIdByNode.get(node.id);
                const rootIndex = rootId ? (rootIdToIndex.get(rootId) ?? -1) : -1;
                rootHue = rootIndex >= 0 ? RADIAL_ROOT_HUES[rootIndex % RADIAL_ROOT_HUES.length] : 210;
            }

            let activityOpacity: number | undefined;
            if (node.data?.nodeSource === 'act') {
                const lastUsed = nodeLastUsedAt[node.id];
                const count = nodeUseCount[node.id] ?? 0;
                if (lastUsed !== undefined) {
                    const recencyScore = Math.exp(-(now - lastUsed) / RECENCY_HALF_LIFE_MS);
                    const freqScore = count / (count + FREQ_K);
                    const activity = 0.5 * recencyScore + 0.5 * freqScore;
                    activityOpacity = 0.25 + 0.75 * activity;
                }
            }

            const fullActData = fullActNodeDataById.get(node.id);

            const activeRelation: 'self' | 'descendant' | null = activeNodeId
                ? node.id === activeNodeId
                    ? 'self'
                    : activeDescendantIds.has(node.id)
                        ? 'descendant'
                        : null
                : null;

            let childActNodes: Array<{ id: string; label: string }> | undefined;
            let parentActNode: { id: string; label: string } | undefined;
            const mergedCreatedBy = (fullActData?.createdBy ?? node.data?.createdBy);
            const mergedParentId = typeof fullActData?.parentId === 'string'
                ? fullActData.parentId
                : (typeof node.data?.parentId === 'string' ? node.data.parentId : undefined);
            const isUserActRoot = node.data?.nodeSource === 'act'
                && mergedCreatedBy === 'user'
                && mergedParentId === undefined;
            if (node.data?.nodeSource === 'act') {
                const childIds = actChildrenByParent.get(node.id) ?? [];
                if (childIds.length > 0) {
                    childActNodes = childIds.map((cid) => {
                        const d = fullActNodeDataById.get(cid);
                        return { id: cid, label: typeof d?.label === 'string' ? d.label : cid };
                    });
                }
                const parentId = typeof fullActData?.parentId === 'string' ? fullActData.parentId : undefined;
                if (parentId) {
                    const pd = fullActNodeDataById.get(parentId);
                    parentActNode = { id: parentId, label: typeof pd?.label === 'string' ? pd.label : parentId };
                }
            }

            return {
                ...node,
                ...(isUserActRoot ? { dragHandle: '.drag-handle' } : {}),
                data: {
                    ...(fullActData ?? {}),
                    ...node.data,
                    layoutMode,
                    radialDepth: persistedGraph.depthById.get(node.id) ?? 0,
                    rootHue,
                    ...(activityOpacity !== undefined ? { activityOpacity } : {}),
                    ...(activeRelation !== null ? { activeRelation } : {}),
                    ...(childActNodes !== undefined ? { childActNodes } : {}),
                    ...(parentActNode !== undefined ? { parentActNode } : {}),
                    ...(node.data?.nodeSource === 'act' ? { onNavigateToNode: handleNavigateToActNode } : {}),
                },
            };
        });
    }, [actChildrenByParent, activeDescendantIds, activeNodeId, canvasNodes, fullActNodeDataById, handleNavigateToActNode, isRadialLayout, nodeLastUsedAt, nodeUseCount, persistedGraph.depthById, persistedRootIdByNode, rootIdToIndex]);

    const radialOverviewNodes = useMemo(
        () => buildDisplayNodes({
            nodes: radialOverviewGraph.positionedNodes,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: radialOverviewGraph.visibleNodeIds,
            childrenByParent: radialOverviewGraph.childrenByParent,
            allReferenceableNodes: radialOverviewGraph.positionedNodes,
            isNodeExpanded: (nodeId) => expandedNodeIdSet.has(nodeId),
            isNodeEditing: (nodeId) => editingNodeId === nodeId,
            isNodeStreaming: (nodeId) => streamingNodeIdSet.has(nodeId),
            onToggleBranch: commands.toggleBranch,
            onOpenDetails: commands.openDetails,
            onOpenReferencedNode: commands.openReferencedNode,
            onCommitLabel: (nodeId, label) => {
                void commands.commitActNodeLabel(nodeId, label);
            },
            onUpdateLabel: (nodeId, label) => {
                void commands.persistActNodeLabel(nodeId, label);
            },
            onRunAction: commands.runActFromNode,
            onAddMedia: (nodeId, file) => commands.addMediaContext(nodeId, file),
        }).map((node) => ({
            ...node,
            data: {
                ...node.data,
                layoutMode: 'radial' as const,
                radialDepth: radialOverviewGraph.depthById.get(node.id) ?? 0,
                ...(node.data.nodeSource === 'persisted' && node.data.kind === 'topic' ? {
                    briefGenerating: briefGeneratingNodeIds.has(node.id),
                    onGenerateBrief: () => handleGenerateBrief(node.id, node.position),
                } : {}),
            },
        })),
        [
            briefGeneratingNodeIds,
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIdSet,
            handleGenerateBrief,
            radialOverviewGraph.childrenByParent,
            radialOverviewGraph.depthById,
            radialOverviewGraph.positionedNodes,
            radialOverviewGraph.visibleNodeIds,
            selectedNodeIds,
            streamingNodeIdSet,
        ],
    );

    const radialOverviewNodeById = useMemo(
        () => new Map(radialOverviewNodes.map((node) => [node.id, node])),
        [radialOverviewNodes],
    );

    const normalizedDisplayNodes = useMemo(() => {
        if (layoutAwareDisplayNodes.length === 0) return layoutAwareDisplayNodes;

        let minX = Infinity;
        let minY = Infinity;
        const safeDisplayNodes = layoutAwareDisplayNodes.map((node, index) => {
            const x = node.position?.x;
            const y = node.position?.y;
            const isManualPosition = node.data?.isManualPosition === true;
            const safe = isRenderableCoordinate(x) && isRenderableCoordinate(y)
                ? node
                : {
                    ...node,
                    position: {
                        x: 120 + ((index % 4) * 360),
                        y: 100 + (Math.floor(index / 4) * 220),
                    },
                };
            if (!isManualPosition) {
                if (safe.position.x < minX) minX = safe.position.x;
                if (safe.position.y < minY) minY = safe.position.y;
            }
            return safe;
        });

        if (!Number.isFinite(minX) || !Number.isFinite(minY)) return safeDisplayNodes;

        const offsetX = minX < 120 ? 120 - minX : 0;
        const offsetY = minY < 100 ? 100 - minY : 0;
        if (offsetX === 0 && offsetY === 0) return safeDisplayNodes;

        return safeDisplayNodes.map((node) => ({
            ...node,
            position: node.data?.isManualPosition === true
                ? node.position
                : { x: node.position.x + offsetX, y: node.position.y + offsetY },
        }));
    }, [layoutAwareDisplayNodes]);

    const emphasizedDisplayNodes = useMemo(() => {
        const isExpandedNode = (node: (typeof normalizedDisplayNodes)[number]) => (
            node.type === 'customTask'
            && typeof node.data === 'object'
            && node.data !== null
            && 'isExpanded' in node.data
            && node.data.isExpanded === true
        );

        const expandedNodes = normalizedDisplayNodes.filter((node) => isExpandedNode(node));

        const MARGIN = 28;
        const expandedBBoxes = expandedNodes.map((n) => {
            const fallback = getDisplayNodeDimensions(n as Node<Record<string, unknown>>);
            const w = n.measured?.width ?? fallback.width;
            const h = n.measured?.height ?? fallback.height;
            return { id: n.id, x: n.position.x, y: n.position.y, w, h };
        });
        const expandedBBoxBuckets = new Map<string, typeof expandedBBoxes>();
        const toCellCoord = (value: number) => Math.floor(value / OVERLAP_CELL_SIZE);
        const getBucketKey = (x: number, y: number) => `${x}:${y}`;

        for (const bbox of expandedBBoxes) {
            const minCellX = toCellCoord(bbox.x - MARGIN);
            const maxCellX = toCellCoord(bbox.x + bbox.w + MARGIN);
            const minCellY = toCellCoord(bbox.y - MARGIN);
            const maxCellY = toCellCoord(bbox.y + bbox.h + MARGIN);
            for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
                    const key = getBucketKey(cellX, cellY);
                    const bucket = expandedBBoxBuckets.get(key) ?? [];
                    bucket.push(bbox);
                    expandedBBoxBuckets.set(key, bucket);
                }
            }
        }

        return normalizedDisplayNodes.map((node) => {
            if (node.type !== 'customTask') {
                return node;
            }
            const isExpanded = isExpandedNode(node);
            const isSelected = selectedNodeIdSet.has(node.id);

            let overlapsExpanded = false;
            if (!isExpanded && expandedNodes.length > 0) {
                const fallback = getDisplayNodeDimensions(node as Node<Record<string, unknown>>);
                const width = node.measured?.width ?? fallback.width;
                const height = node.measured?.height ?? fallback.height;
                const minCellX = toCellCoord(node.position.x - MARGIN);
                const maxCellX = toCellCoord(node.position.x + width + MARGIN);
                const minCellY = toCellCoord(node.position.y - MARGIN);
                const maxCellY = toCellCoord(node.position.y + height + MARGIN);
                const candidateBBoxes = new Set<(typeof expandedBBoxes)[number]>();
                for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
                    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
                        for (const bbox of expandedBBoxBuckets.get(getBucketKey(cellX, cellY)) ?? []) {
                            candidateBBoxes.add(bbox);
                        }
                    }
                }
                for (const bbox of candidateBBoxes) {
                    if (
                        bbox.id !== node.id
                        && node.position.x < bbox.x + bbox.w + MARGIN
                        && node.position.x + width + MARGIN > bbox.x
                        && node.position.y < bbox.y + bbox.h + MARGIN
                        && node.position.y + height + MARGIN > bbox.y
                    ) {
                        overlapsExpanded = true;
                        break;
                    }
                }
            }

            return {
                ...node,
                zIndex: isExpanded ? 120 : (isSelected ? 110 : (overlapsExpanded ? 30 : 80)),
                style: {
                    ...(node.style ?? {}),
                    opacity: overlapsExpanded && !isSelected ? 0.4 : 1,
                },
            };
        });
    }, [normalizedDisplayNodes, selectedNodeIdSet]);

    // ── Act tree group rectangles ─────────────────────────────────────────────
    const actTreeGroupNodes = useMemo(() => {
        const GROUP_PAD = 20;
        const HEADER_H = 28;

        const actDisplayNodes = emphasizedDisplayNodes.filter(
            (n) => (n.data as Record<string, unknown>)?.nodeSource === 'act',
        );
        if (actDisplayNodes.length === 0) return [];

        const actIdSet = new Set(actDisplayNodes.map((n) => n.id));

        const findUserOwner = (nodeId: string, seen = new Set<string>()): string | null => {
            if (seen.has(nodeId)) return null;
            seen.add(nodeId);
            const data = fullActNodeDataById.get(nodeId);
            if (!data) return null;
            if (data.createdBy === 'user') return nodeId;
            const parentId = typeof data.parentId === 'string' ? data.parentId : undefined;
            if (parentId && actIdSet.has(parentId)) return findUserOwner(parentId, seen);
            return null;
        };

        const byOwner = new Map<string, typeof actDisplayNodes>();
        for (const node of actDisplayNodes) {
            const ownerId = findUserOwner(node.id);
            if (!ownerId) continue;
            const group = byOwner.get(ownerId) ?? [];
            group.push(node);
            byOwner.set(ownerId, group);
        }

        const groupNodes: Node[] = [];
        for (const [ownerId, nodes] of byOwner) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const node of nodes) {
                const fallback = getDisplayNodeDimensions(node as Node<Record<string, unknown>>);
                const width = node.measured?.width ?? fallback.width;
                const height = node.measured?.height ?? fallback.height;
                minX = Math.min(minX, node.position.x);
                minY = Math.min(minY, node.position.y);
                maxX = Math.max(maxX, node.position.x + width);
                maxY = Math.max(maxY, node.position.y + height);
            }

            const ownerData = fullActNodeDataById.get(ownerId);
            const label = typeof ownerData?.label === 'string' ? ownerData.label : '';

            groupNodes.push({
                id: `act-group-${ownerId}`,
                type: 'actTreeGroup',
                position: {
                    x: minX - GROUP_PAD,
                    y: minY - HEADER_H - GROUP_PAD,
                },
                data: {
                    width: maxX - minX + GROUP_PAD * 2,
                    height: maxY - minY + HEADER_H + GROUP_PAD * 2,
                    label,
                    nodeCount: nodes.length,
                    createdBy: 'user',
                },
                selectable: false,
                draggable: false,
                focusable: false,
            } as Node);
        }
        return groupNodes;
    }, [emphasizedDisplayNodes, fullActNodeDataById]);

    return {
        displayNodes,
        briefGeneratingNodeIds,
        canvasNodes,
        persistedRootIdByNode,
        activeDescendantIds,
        layoutAwareDisplayNodes,
        radialOverviewNodes,
        radialOverviewNodeById,
        normalizedDisplayNodes,
        emphasizedDisplayNodes,
        actTreeGroupNodes,
        handleGenerateBrief,
        handleNavigateToActNode,
    };
}

"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    Background,
    Controls,
    Edge,
    MarkerType,
    MiniMap,
    Node,
    ReactFlow,
    SelectionMode,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphCommands } from '@/features/graph/hooks/useGraphCommands';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { useStreamPreferencesStore } from '@/features/agentTools/store/stream-preferences-store';
import { projectSelectionGroups } from '@/features/agentInteraction/selectors/projectSelectionGroups';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';

import { GraphNodeCard } from './GraphNodeCard';
import { RadialOverview } from './RadialOverview';
import { SelectionHeaderNodeCard, SelectionOptionNodeCard } from './SelectionGroupNodes';
import { SelectedNodePanel } from './SelectedNodePanel';
import {
    getCollapsedNodeWidth,
    getExpandedNodeWidth,
    getLayoutDimensionsForNodeType,
} from '../constants/nodeDimensions';
import { buildDisplayEdges, buildDisplayNodes } from '../selectors/projectGraph';
import { projectActOverlay } from '../selectors/projectActOverlay';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import { createPersistedGraphMockHundred } from '../mocks/persistedGraphMockHundred';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';

const RADIAL_ROOT_HUES = [198, 256, 148, 34, 320, 82, 12, 228];

class GraphNodeRenderBoundary extends React.Component<
    { children: React.ReactNode; nodeId?: string; label?: string },
    { hasError: boolean; errorMessage: string | null }
> {
    constructor(props: { children: React.ReactNode; nodeId?: string; label?: string }) {
        super(props);
        this.state = { hasError: false, errorMessage: null };
    }

    static getDerivedStateFromError(error: Error) {
        return {
            hasError: true,
            errorMessage: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: Error) {
        console.error('[GraphNodeCard DEBUG] render error', {
            nodeId: this.props.nodeId,
            label: this.props.label,
            error,
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-[340px] rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive shadow-sm">
                    <div className="font-semibold">GraphNodeCard render failed</div>
                    <div className="mt-1 break-all">nodeId: {this.props.nodeId ?? 'unknown'}</div>
                    <div className="mt-1 break-all">label: {this.props.label ?? ''}</div>
                    <div className="mt-1 break-all">{this.state.errorMessage}</div>
                </div>
            );
        }
        return this.props.children;
    }
}

function GraphNodeCardWithBoundary(props: React.ComponentProps<typeof GraphNodeCard>) {
    const label = typeof props.data?.label === 'string' ? props.data.label : '';
    return (
        <GraphNodeRenderBoundary nodeId={props.id} label={label}>
            <GraphNodeCard {...props} />
        </GraphNodeRenderBoundary>
    );
}

const nodeTypes = {
    customTask: GraphNodeCardWithBoundary,
    selectionHeader: SelectionHeaderNodeCard,
    selectionNode: SelectionOptionNodeCard,
};

function isRenderableCoordinate(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

function getDisplayNodeDimensions(node: Node<Record<string, unknown>>) {
    const data = (node.data ?? {}) as Partial<GraphNodeRender['data']>;

    if (data.layoutMode === 'radial' && data.nodeSource === 'persisted') {
        const radialDepth = typeof data.radialDepth === 'number' ? data.radialDepth : 0;
        const size = radialDepth === 0 ? 132 : (radialDepth === 1 ? 120 : (radialDepth === 2 ? 110 : 96));
        return { width: size, height: size };
    }

    const nodeKind = typeof data.kind === 'string' ? data.kind : undefined;
    const label = typeof data.label === 'string' ? data.label : undefined;
    const isExpanded = data.isExpanded === true;
    const hasChildNodes = data.hasChildNodes === true;
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

function overlapsWithMargin(left: Node<Record<string, unknown>>, right: Node<Record<string, unknown>>, margin = 28) {
    const leftDimensions = getDisplayNodeDimensions(left);
    const rightDimensions = getDisplayNodeDimensions(right);

    return !(
        left.position.x + leftDimensions.width + margin < right.position.x - margin
        || left.position.x - margin > right.position.x + rightDimensions.width + margin
        || left.position.y + leftDimensions.height + margin < right.position.y - margin
        || left.position.y - margin > right.position.y + rightDimensions.height + margin
    );
}

function sameSortedIds(left: string[], right: string[]) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((id, index) => id === right[index]);
}

function readClientPoint(event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null {
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;

    if ('touches' in nativeEvent) {
        const touch = nativeEvent.touches[0] ?? nativeEvent.changedTouches[0];
        if (!touch) {
            return null;
        }
        return { x: touch.clientX, y: touch.clientY };
    }

    if ('clientX' in nativeEvent && 'clientY' in nativeEvent) {
        return { x: nativeEvent.clientX, y: nativeEvent.clientY };
    }

    return null;
}

type NodeSide = 'left' | 'right' | 'top' | 'bottom';

function oppositeSide(side: NodeSide): NodeSide {
    if (side === 'left') return 'right';
    if (side === 'right') return 'left';
    if (side === 'top') return 'bottom';
    return 'top';
}

function resolveNearestSides(sourceNode: Node<Record<string, unknown>>, targetNode: Node<Record<string, unknown>>) {
    const sourceDimensions = getDisplayNodeDimensions(sourceNode);
    const targetDimensions = getDisplayNodeDimensions(targetNode);

    const sourceCenterX = sourceNode.position.x + (sourceDimensions.width / 2);
    const sourceCenterY = sourceNode.position.y + (sourceDimensions.height / 2);
    const targetCenterX = targetNode.position.x + (targetDimensions.width / 2);
    const targetCenterY = targetNode.position.y + (targetDimensions.height / 2);

    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;
    const useHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);

    const sourceSide: NodeSide = useHorizontal
        ? (deltaX >= 0 ? 'right' : 'left')
        : (deltaY >= 0 ? 'bottom' : 'top');

    return {
        sourceSide,
        targetSide: oppositeSide(sourceSide),
    };
}

export function GraphCanvas() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const {
        persistedNodes,
        persistedEdges,
        actNodes,
        actEdges,
        setSelectedNodes,
        setActiveNode,
        toggleExpandedNode,
        addOrUpdateActNode,
        addQueryActNode,
        addEmptyActNode,
        removeActNode,
        setPersistedGraph,
        setActGraph,
        activeNodeId,
        editingNodeId,
        selectedNodeIds,
        expandedNodeIds,
        expandedBranchNodeIds,
        streamingNodeIds,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const autoRouteEdgeHandles = useStreamPreferencesStore((state) => state.autoRouteEdgeHandles);
    const setStreamPreferences = useStreamPreferencesStore((state) => state.setPreferences);
    const selectionGroups = useAgentInteractionStore((state) => state.groups);
    const toggleSelectionOption = useAgentInteractionStore((state) => state.toggleOptionSelection);
    const confirmSelection = useAgentInteractionStore((state) => state.confirmSelection);
    const clearSelectionGroup = useAgentInteractionStore((state) => state.clearSelection);
    const cancelSelectionGroup = useAgentInteractionStore((state) => state.cancelGroup);
    const commands = useGraphCommands({ workspaceId, topicId });
    const reactFlowInstance = useReactFlow();

    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);
    const previousViewSignatureRef = useRef<string | null>(null);
    const pendingRadialFocusNodeIdRef = useRef<string | null>(null);
    const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
    const isShiftMarqueeSelectionRef = useRef(false);
    const shiftMarqueeStartRef = useRef<{ x: number; y: number } | null>(null);
    const selectionComposerNodeIdRef = useRef<string | null>(null);
    useLayoutEffect(() => {
        selectedNodeIdsRef.current = selectedNodeIds;
    });
    const usePersistedGraphMock = useMemo(() => {
        return searchParams.get('graphMock') === '1';
    }, [searchParams]);
    const persistedLayoutMode = useMemo(() => {
        return searchParams.get('layout') === 'radial'
            ? 'radial' as const
            : 'force' as const;
    }, [searchParams]);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
        if (usePersistedGraphMock) {
            const mock = createPersistedGraphMockHundred(topicId);
            persistedNodeCountRef.current = mock.nodes.length;
            setPersistedGraphRef.current(mock.nodes, mock.edges);
            return;
        }

        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes) => {
            const nextPersistedNodes: Node<PersistedNodeData>[] = topicNodes.map((node, index) => ({
                id: node.id,
                type: 'customTask',
                position: { x: 120, y: index * 180 + 80 },
                data: {
                    nodeSource: 'persisted',
                    createdBy: node.createdBy,
                    topicId: node.topicId,
                    label: node.title,
                    kind: node.kind,
                    contextSummary: node.contextSummary,
                    detailHtml: node.detailHtml,
                    contentMd: node.contentMd,
                    evidenceRefs: node.evidenceRefs,
                    parentId: node.parentId,
                    referencedNodeIds: node.referencedNodeIds,
                },
            }));

            const nextPersistedEdges: Edge[] = topicNodes
                .filter((node) => node.parentId)
                .map((node) => ({
                    id: `e-${node.parentId}-${node.id}`,
                    source: node.parentId!,
                    target: node.id,
                    animated: true,
                }));

            if (nextPersistedNodes.length === 0 && persistedNodeCountRef.current > 0) {
                return;
            }
            persistedNodeCountRef.current = nextPersistedNodes.length;
            setPersistedGraphRef.current(nextPersistedNodes, nextPersistedEdges);
        });

        return () => unsubscribe();
    }, [topicId, usePersistedGraphMock, workspaceId]);

    useEffect(() => {
        const unsubscribe = actDraftService.subscribeDrafts(workspaceId, topicId, (draftNodes) => {
            const draftActNodes: GraphNodeBase[] = draftNodes.map((node, index) => ({
                id: node.id,
                type: 'customTask',
                position: { x: 420, y: index * 180 + 120 },
                data: {
                    nodeSource: 'act',
                    createdBy: node.createdBy ?? 'agent',
                    topicId: node.topicId ?? topicId,
                    label: node.title,
                    kind: 'act',
                    contentMd: node.contentMd,
                    contextSummary: node.contextSummary,
                    detailHtml: node.detailHtml,
                    referencedNodeIds: node.referencedNodeIds,
                },
            }));
            const graphState = useGraphStore.getState();
            const draftNodeIds = new Set(draftActNodes.map((node) => node.id));
            const preservedLiveNodes = graphState.actNodes.filter((node) => {
                if (draftNodeIds.has(node.id)) {
                    return false;
                }
                return graphState.streamingNodeIds.includes(node.id) || graphState.editingNodeId === node.id;
            });
            const nextActNodes = [...draftActNodes, ...preservedLiveNodes];
            const nextActEdges: Edge[] = nextActNodes.flatMap((node) => {
                const referencedNodeIds = Array.isArray(node.data?.referencedNodeIds)
                    ? node.data.referencedNodeIds.filter((value): value is string => typeof value === 'string' && value !== node.id)
                    : [];
                return referencedNodeIds.map((sourceId) => ({
                    id: `edge-ctx-${sourceId}-${node.id}`,
                    source: sourceId,
                    target: node.id,
                    animated: true,
                    style: { stroke: '#888', strokeDasharray: '5,5' },
                }));
            });
            setActGraph(nextActNodes, nextActEdges);
        });

        return () => unsubscribe();
    }, [setActGraph, topicId, workspaceId]);

    const effectiveExpandedBranchNodeIds = useMemo(() => {
        const allPersistedIds = new Set((persistedNodes as GraphNodeBase[]).map((node) => node.id));
        const rootIds = (persistedNodes as GraphNodeBase[])
            .filter((node) => {
                const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
                return !parentId || !allPersistedIds.has(parentId);
            })
            .map((node) => node.id);

        return [...new Set([...rootIds, ...expandedBranchNodeIds])];
    }, [expandedBranchNodeIds, persistedNodes]);

    const persistedGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            effectiveExpandedBranchNodeIds,
            expandedNodeIds,
            persistedLayoutMode,
        ),
        [effectiveExpandedBranchNodeIds, expandedNodeIds, persistedEdges, persistedLayoutMode, persistedNodes],
    );
    const isRadialLayout = persistedLayoutMode === 'radial';
    const radialOverviewGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            effectiveExpandedBranchNodeIds,
            expandedNodeIds,
            'radial',
        ),
        [effectiveExpandedBranchNodeIds, expandedNodeIds, persistedEdges, persistedNodes],
    );

    const positionedActNodes = useMemo(
        () => projectActOverlay({
            actNodes: actNodes as GraphNodeBase[],
            persistedNodes: persistedGraph.positionedNodes,
            expandedNodeIds,
        }),
        [actNodes, expandedNodeIds, persistedGraph.positionedNodes],
    );

    const regularGraphNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...positionedActNodes],
        [persistedGraph.positionedNodes, positionedActNodes],
    );

    const selectionProjection = useMemo(
        () => projectSelectionGroups({
            groups: Object.values(selectionGroups),
            baseNodes: regularGraphNodes,
            expandedNodeIds,
            actions: {
                toggleOptionSelection: toggleSelectionOption,
                confirmSelection,
                clearSelection: clearSelectionGroup,
                cancelGroup: cancelSelectionGroup,
            },
        }),
        [cancelSelectionGroup, clearSelectionGroup, confirmSelection, expandedNodeIds, regularGraphNodes, selectionGroups, toggleSelectionOption],
    );

    const allReferenceableNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...positionedActNodes],
        [persistedGraph.positionedNodes, positionedActNodes],
    );

    const displayNodes = useMemo(
        () => buildDisplayNodes({
            nodes: regularGraphNodes,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: persistedGraph.visibleNodeIds,
            childrenByParent: persistedGraph.childrenByParent,
            allReferenceableNodes,
            isNodeExpanded: (nodeId) => expandedNodeIds.includes(nodeId),
            isNodeEditing: (nodeId) => editingNodeId === nodeId,
            isNodeStreaming: (nodeId) => streamingNodeIds.includes(nodeId),
            onToggleBranch: commands.toggleBranch,
            onOpenDetails: commands.openDetails,
            onOpenReferencedNode: commands.openReferencedNode,
            onCommitLabel: (nodeId, label) => {
                void commands.commitActNodeLabel(nodeId, label);
            },
            onRunAction: commands.runActFromNode,
            onAddMedia: (nodeId, file) => commands.addMediaContext(nodeId, file),
        }),
        [
            allReferenceableNodes,
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIds,
            persistedGraph.childrenByParent,
            persistedGraph.visibleNodeIds,
            regularGraphNodes,
            selectedNodeIds,
            streamingNodeIds,
        ],
    );

    const canvasNodes = useMemo(
        () => [...displayNodes, ...selectionProjection.nodes],
        [displayNodes, selectionProjection.nodes],
    );

    const layoutAwareDisplayNodes = useMemo(
        () => canvasNodes.map((node) => {
            const layoutMode: 'force' | 'radial' = isRadialLayout && node.data?.nodeSource === 'persisted'
                ? 'radial'
                : 'force';

            return {
                ...node,
                data: {
                    ...node.data,
                    layoutMode,
                    radialDepth: persistedGraph.depthById.get(node.id) ?? 0,
                },
            };
        }),
        [canvasNodes, isRadialLayout, persistedGraph.depthById],
    );

    const radialOverviewNodes = useMemo(
        () => buildDisplayNodes({
            nodes: radialOverviewGraph.positionedNodes,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: radialOverviewGraph.visibleNodeIds,
            childrenByParent: radialOverviewGraph.childrenByParent,
            allReferenceableNodes: radialOverviewGraph.positionedNodes,
            isNodeExpanded: (nodeId) => expandedNodeIds.includes(nodeId),
            isNodeEditing: (nodeId) => editingNodeId === nodeId,
            isNodeStreaming: (nodeId) => streamingNodeIds.includes(nodeId),
            onToggleBranch: commands.toggleBranch,
            onOpenDetails: commands.openDetails,
            onOpenReferencedNode: commands.openReferencedNode,
            onCommitLabel: (nodeId, label) => {
                void commands.commitActNodeLabel(nodeId, label);
            },
            onRunAction: commands.runActFromNode,
            onAddMedia: (nodeId, file) => commands.addMediaContext(nodeId, file),
        }).map((node) => ({
            ...node,
            data: {
                ...node.data,
                layoutMode: 'radial' as const,
                radialDepth: radialOverviewGraph.depthById.get(node.id) ?? 0,
            },
        })),
        [
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIds,
            radialOverviewGraph.childrenByParent,
            radialOverviewGraph.depthById,
            radialOverviewGraph.positionedNodes,
            radialOverviewGraph.visibleNodeIds,
            selectedNodeIds,
            streamingNodeIds,
        ],
    );

    const radialOverviewNodeById = useMemo(
        () => new Map(radialOverviewNodes.map((node) => [node.id, node])),
        [radialOverviewNodes],
    );

    useEffect(() => {
        const composerId = selectionComposerNodeIdRef.current;
        if (composerId && !actNodes.some((node) => node.id === composerId)) {
            selectionComposerNodeIdRef.current = null;
        }

        const contextNodeIds = [...new Set(selectedNodeIds.filter((id) => id !== selectionComposerNodeIdRef.current))].sort();

        if (contextNodeIds.length === 0) {
            const currentComposerId = selectionComposerNodeIdRef.current;
            if (!currentComposerId) {
                return;
            }
            const composerNode = actNodes.find((node) => node.id === currentComposerId);
            const hasLabel = typeof composerNode?.data?.label === 'string' && composerNode.data.label.trim().length > 0;
            const hasResolvedContent = [
                composerNode?.data?.contentMd,
                composerNode?.data?.contextSummary,
                composerNode?.data?.detailHtml,
                composerNode?.data?.thoughtMd,
            ].some((value) => typeof value === 'string' && value.trim().length > 0);

            if (composerNode && !hasLabel && !hasResolvedContent) {
                removeActNode(currentComposerId);
            }
            selectionComposerNodeIdRef.current = null;
            return;
        }

        const currentComposerId = selectionComposerNodeIdRef.current;
        if (currentComposerId) {
            const composerNode = actNodes.find((node) => node.id === currentComposerId);
            if (!composerNode) {
                selectionComposerNodeIdRef.current = null;
                return;
            }

            const hasLabel = typeof composerNode.data?.label === 'string' && composerNode.data.label.trim().length > 0;
            const hasResolvedContent = [
                composerNode.data?.contentMd,
                composerNode.data?.contextSummary,
                composerNode.data?.detailHtml,
                composerNode.data?.thoughtMd,
            ].some((value) => typeof value === 'string' && value.trim().length > 0);

            if (hasLabel || hasResolvedContent) {
                selectionComposerNodeIdRef.current = null;
                return;
            }

            const currentReferenced = Array.isArray(composerNode.data?.referencedNodeIds)
                ? composerNode.data.referencedNodeIds.filter((value): value is string => typeof value === 'string').sort()
                : [];
            if (!sameSortedIds(currentReferenced, contextNodeIds)) {
                addOrUpdateActNode(currentComposerId, { referencedNodeIds: contextNodeIds, kind: 'act', createdBy: 'user' });
            }
            return;
        }

        const contextNodes = regularGraphNodes.filter((node) => contextNodeIds.includes(node.id));
        if (contextNodes.length === 0) {
            return;
        }

        const maxRightX = contextNodes.reduce((max, node) => {
            const { width } = getDisplayNodeDimensions(node as GraphNodeRender);
            return Math.max(max, node.position.x + width);
        }, contextNodes[0].position.x);
        const averageY = contextNodes.reduce((sum, node) => sum + node.position.y, 0) / contextNodes.length;
        const composerNodeId = addQueryActNode({ x: maxRightX + 220, y: averageY }, '');
        selectionComposerNodeIdRef.current = composerNodeId;
        addOrUpdateActNode(composerNodeId, { referencedNodeIds: contextNodeIds, kind: 'act', createdBy: 'user' });
    }, [actNodes, addOrUpdateActNode, addQueryActNode, regularGraphNodes, removeActNode, selectedNodeIds]);

    const normalizedDisplayNodes = useMemo(() => {
        const safeDisplayNodes = layoutAwareDisplayNodes.map((node, index) => {
            const x = node.position?.x;
            const y = node.position?.y;
            if (isRenderableCoordinate(x) && isRenderableCoordinate(y)) {
                return node;
            }
            return {
                ...node,
                position: {
                    x: 120 + ((index % 4) * 360),
                    y: 100 + (Math.floor(index / 4) * 220),
                },
            };
        });

        if (safeDisplayNodes.length === 0) {
            return safeDisplayNodes;
        }

        const minX = Math.min(...safeDisplayNodes.map((node) => node.position.x));
        const minY = Math.min(...safeDisplayNodes.map((node) => node.position.y));
        const offsetX = minX < 120 ? 120 - minX : 0;
        const offsetY = minY < 100 ? 100 - minY : 0;

        if (offsetX === 0 && offsetY === 0) {
            return safeDisplayNodes;
        }

        return safeDisplayNodes.map((node) => ({
            ...node,
            position: {
                x: node.position.x + offsetX,
                y: node.position.y + offsetY,
            },
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
        if (expandedNodes.length === 0) {
            return normalizedDisplayNodes;
        }

        return normalizedDisplayNodes.map((node) => {
            if (node.type !== 'customTask') {
                return node;
            }
            const isExpanded = isExpandedNode(node);
            const isSelected = selectedNodeIds.includes(node.id);
            const overlapsExpanded = !isExpanded && expandedNodes.some((expandedNode) => (
                expandedNode.id !== node.id && overlapsWithMargin(node, expandedNode)
            ));

            return {
                ...node,
                zIndex: isExpanded ? 120 : (isSelected ? 110 : (overlapsExpanded ? 30 : 80)),
                style: {
                    ...(node.style ?? {}),
                    opacity: overlapsExpanded && !isSelected ? 0.4 : 1,
                },
            };
        });
    }, [normalizedDisplayNodes, selectedNodeIds]);

    const persistedRootIdByNode = useMemo(() => {
        const resolved = new Map<string, string>();
        const parentById = new Map(
            persistedGraph.positionedNodes.map((node) => [
                node.id,
                typeof node.data?.parentId === 'string' ? node.data.parentId : undefined,
            ]),
        );

        persistedGraph.positionedNodes.forEach((node) => {
            let currentId: string | undefined = node.id;
            let currentRoot = node.id;

            while (currentId) {
                const parentId = parentById.get(currentId);
                if (!parentId) {
                    currentRoot = currentId;
                    break;
                }
                currentId = parentId;
            }

            resolved.set(node.id, currentRoot);
        });

        return resolved;
    }, [persistedGraph.positionedNodes]);

    const persistedParentById = useMemo(
        () => new Map(
            persistedNodes.map((node) => [
                node.id,
                typeof node.data?.parentId === 'string' ? node.data.parentId : undefined,
            ]),
        ),
        [persistedNodes],
    );

    const displayEdges = useMemo(
        () => {
            if (isRadialLayout) {
                return [];
            }

            const nodeById = new Map(emphasizedDisplayNodes.map((node) => [node.id, node]));

            return buildDisplayEdges(
                [...persistedGraph.hierarchyEdges, ...persistedGraph.relationEdges],
                [...actEdges, ...selectionProjection.edges],
            ).map((edge) => {
            const sourceNode = nodeById.get(edge.source);
            const targetNode = nodeById.get(edge.target);
            const isActContext = edge.id.startsWith('edge-ctx-');
            const isRelation = 'relationType' in edge && edge.relationType === 'related';
            const isActContextFocused = isActContext
                && (selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target));
            const isRelationFocused = isRelation
                && (selectedNodeIds.includes(edge.source) || selectedNodeIds.includes(edge.target));
            const sourceRootId = persistedRootIdByNode.get(edge.source);
            const targetRootId = persistedRootIdByNode.get(edge.target);
            const rootId = sourceRootId ?? targetRootId;
            const rootIndex = rootId ? persistedGraph.rootIds.indexOf(rootId) : -1;
            const rootHue = rootIndex >= 0
                ? RADIAL_ROOT_HUES[rootIndex % RADIAL_ROOT_HUES.length]
                : 210;
            const sourceDepth = persistedGraph.depthById.get(edge.source) ?? persistedGraph.depthById.get(edge.target) ?? 0;
            const hierarchyStroke = `hsla(${rootHue} 70% ${Math.min(54 + (sourceDepth * 5), 72)}% / 1)`;
            const relationStroke = `hsla(${rootHue} 56% ${Math.min(68 + (sourceDepth * 3), 82)}% / 1)`;
            const nearestSides = autoRouteEdgeHandles && sourceNode && targetNode && sourceNode.type === 'customTask' && targetNode.type === 'customTask'
                ? resolveNearestSides(sourceNode as Node<Record<string, unknown>>, targetNode as Node<Record<string, unknown>>)
                : null;

            return {
                ...edge,
                sourceHandle: nearestSides ? `source-${nearestSides.sourceSide}` : (edge as Edge).sourceHandle,
                targetHandle: nearestSides ? `target-${nearestSides.targetSide}` : (edge as Edge).targetHandle,
                type: isActContext ? 'simplebezier' : (isRelation ? 'smoothstep' : 'default'),
                zIndex: isActContext ? 70 : (isRelationFocused ? 55 : (isRelation ? 40 : 60)),
                interactionWidth: isActContext ? 32 : 24,
                markerEnd: isActContext
                    ? {
                        type: MarkerType.ArrowClosed,
                        width: 18,
                        height: 18,
                        color: isActContextFocused ? '#0f766e' : '#64748b',
                    }
                    : undefined,
                label: isActContextFocused ? 'context' : undefined,
                labelStyle: isActContextFocused
                    ? {
                        fill: '#0f766e',
                        fontSize: 11,
                        fontWeight: 600,
                    }
                    : undefined,
                labelBgStyle: isActContextFocused
                    ? {
                        fill: 'rgba(248, 250, 252, 0.92)',
                        fillOpacity: 1,
                    }
                    : undefined,
                labelBgPadding: isActContextFocused ? [6, 3] as [number, number] : undefined,
                labelBgBorderRadius: isActContextFocused ? 6 : undefined,
                style: {
                    stroke: isActContext
                        ? (isActContextFocused ? '#0f766e' : '#64748b')
                        : (isRelation
                            ? (isRelationFocused ? hierarchyStroke : relationStroke)
                            : hierarchyStroke),
                    strokeWidth: isActContext
                        ? (isActContextFocused ? 2.1 : 1.4)
                        : (isRelation ? (isRelationFocused ? 2.2 : 1.6) : 3),
                    strokeOpacity: isActContext
                        ? (isActContextFocused ? 0.9 : 0.46)
                        : (isRelation ? (isRelationFocused ? 0.72 : 0.34) : 1),
                    strokeDasharray: isActContext ? '6 4' : (isRelation ? '7 5' : undefined),
                    ...((edge as Edge).style ?? {}),
                },
            };
            });
        },
        [
            actEdges,
            autoRouteEdgeHandles,
            emphasizedDisplayNodes,
            isRadialLayout,
            persistedGraph.depthById,
            persistedGraph.hierarchyEdges,
            persistedGraph.relationEdges,
            persistedGraph.rootIds,
            persistedRootIdByNode,
            selectedNodeIds,
            selectionProjection.edges,
        ],
    );

    const focusNode = useCallback((nodeId: string) => {
        const targetNode = emphasizedDisplayNodes.find((node) => node.id === nodeId);
        if (!targetNode) {
            return;
        }

        setActiveNode(targetNode.id);
        const currentZoom = reactFlowInstance.getZoom();
        const nextZoom = Math.min(Math.max(currentZoom, 1.16), 1.3);
        reactFlowInstance.setCenter(
            targetNode.position.x + 170,
            targetNode.position.y + 90,
            { duration: 320, zoom: nextZoom },
        );
    }, [emphasizedDisplayNodes, reactFlowInstance, setActiveNode]);

    const handlePaneDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const pane = target.closest('.react-flow__pane');
        const node = target.closest('.react-flow__node');
        const control = target.closest('button, input, textarea, [role="button"]');
        if (!pane || node || control) {
            return;
        }

        const flowPosition = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        addEmptyActNode(flowPosition);
    }, [addEmptyActNode, reactFlowInstance]);

    const viewSignature = useMemo(
        () => JSON.stringify({
            nodeIds: emphasizedDisplayNodes.map((node) => node.id),
            edgeIds: displayEdges.map((edge) => edge.id),
        }),
        [displayEdges, emphasizedDisplayNodes],
    );

    useEffect(() => {
        if (emphasizedDisplayNodes.length === 0) {
            previousViewSignatureRef.current = null;
            return;
        }

        if (viewSignature === previousViewSignatureRef.current) {
            return;
        }
        previousViewSignatureRef.current = viewSignature;

        const timeoutId = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: 180,
                padding: 0.14,
                minZoom: 0.2,
                maxZoom: 1.2,
            });
        }, 50);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [emphasizedDisplayNodes.length, reactFlowInstance, viewSignature]);

    useEffect(() => {
        const pendingNodeId = pendingRadialFocusNodeIdRef.current;
        if (!pendingNodeId) {
            return;
        }

        if (!emphasizedDisplayNodes.some((node) => node.id === pendingNodeId)) {
            return;
        }

        pendingRadialFocusNodeIdRef.current = null;
        focusNode(pendingNodeId);
    }, [emphasizedDisplayNodes, focusNode]);

    const handleSelectionChange = useCallback(({ nodes: changedNodes }: { nodes: Node[] }) => {
        if (isShiftMarqueeSelectionRef.current) {
            return;
        }
        const ids = changedNodes
            .filter((n) => n.type === 'customTask' || n.type == null)
            .map((n) => n.id)
            .sort();
        if (ids.length === 0) {
            return;
        }
        const current = [...selectedNodeIdsRef.current].sort();
        const nextIds = [...new Set([...current, ...ids])].sort();
        if (nextIds.length === current.length && nextIds.every((id, i) => id === current[i])) {
            return;
        }
        setSelectedNodes(nextIds);
    }, [setSelectedNodes]);

    const handleSelectionTyping = useCallback((event: KeyboardEvent) => {
        if (selectedNodeIds.length === 0 || editingNodeId) {
            return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }
        if (event.key.length !== 1 || /\s/.test(event.key)) {
            return;
        }

        const target = event.target;
        if (
            target instanceof HTMLElement
            && (
                target.tagName === 'INPUT'
                || target.tagName === 'TEXTAREA'
                || target.isContentEditable
            )
        ) {
            return;
        }

        const selectedNodes = emphasizedDisplayNodes.filter((node) => selectedNodeIds.includes(node.id));
        if (selectedNodes.length === 0) {
            return;
        }

        const averageX = selectedNodes.reduce((sum, node) => sum + node.position.x, 0) / selectedNodes.length;
        const maxY = selectedNodes.reduce((max, node) => Math.max(max, node.position.y), selectedNodes[0].position.y);
        addQueryActNode({ x: averageX, y: maxY + 240 }, event.key);
        event.preventDefault();
    }, [addQueryActNode, editingNodeId, emphasizedDisplayNodes, selectedNodeIds]);

    const handleDraftNodeFocusNavigation = useCallback((event: KeyboardEvent) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
            return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        const target = event.target;
        if (
            target instanceof HTMLElement
            && (
                target.tagName === 'INPUT'
                || target.tagName === 'TEXTAREA'
                || target.isContentEditable
            )
        ) {
            return;
        }

        const draftActNodes = emphasizedDisplayNodes
            .filter((node) => node.type === 'customTask')
            .filter((node) => {
                const data = node.data as Partial<GraphNodeRender['data']> | undefined;
                return data?.kind === 'act' && data?.actStage === 'draft';
            })
            .sort((left, right) => {
                if (left.position.y !== right.position.y) {
                    return left.position.y - right.position.y;
                }
                return left.position.x - right.position.x;
            });

        if (draftActNodes.length === 0) {
            return;
        }

        const currentIndex = draftActNodes.findIndex((node) => node.id === activeNodeId);
        const movingDown = event.key === 'ArrowDown';
        const fallbackIndex = movingDown ? -1 : 0;
        const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
        const direction = movingDown ? 1 : -1;
        const nextIndex = (baseIndex + direction + draftActNodes.length) % draftActNodes.length;

        const nextNodeId = draftActNodes[nextIndex].id;
        if (event.shiftKey) {
            setSelectedNodes([nextNodeId]);
        }
        focusNode(nextNodeId);
        event.preventDefault();
    }, [activeNodeId, emphasizedDisplayNodes, focusNode, setSelectedNodes]);

    useEffect(() => {
        const handleFocusNode = (event: Event) => {
            const customEvent = event as CustomEvent<{ nodeId: string }>;
            if (customEvent.detail?.nodeId) {
                toggleExpandedNode(customEvent.detail.nodeId);
                focusNode(customEvent.detail.nodeId);
            }
        };
        window.addEventListener('action:focus-node', handleFocusNode);
        return () => window.removeEventListener('action:focus-node', handleFocusNode);
    }, [focusNode, toggleExpandedNode]);

    useEffect(() => {
        window.addEventListener('keydown', handleSelectionTyping);
        return () => window.removeEventListener('keydown', handleSelectionTyping);
    }, [handleSelectionTyping]);

    useEffect(() => {
        window.addEventListener('keydown', handleDraftNodeFocusNavigation);
        return () => window.removeEventListener('keydown', handleDraftNodeFocusNavigation);
    }, [handleDraftNodeFocusNavigation]);

    const activateRadialNode = useCallback((nodeId: string) => {
        setSelectedNodes([...selectedNodeIdsRef.current, nodeId]);
        commands.openDetails(nodeId);

        const radialNode = radialOverviewNodeById.get(nodeId);
        const hasChildNodes = radialNode?.data?.hasChildNodes === true;
        const branchExpanded = radialNode?.data?.branchExpanded === true;

        const ancestorIds: string[] = [];
        let currentId = persistedParentById.get(nodeId);
        while (currentId) {
            ancestorIds.unshift(currentId);
            currentId = persistedParentById.get(currentId);
        }

        ancestorIds.forEach((ancestorId) => {
            commands.expandBranch(ancestorId);
        });

        if (hasChildNodes && !branchExpanded) {
            commands.expandBranch(nodeId);
        }

        if (!isRadialLayout) {
            pendingRadialFocusNodeIdRef.current = nodeId;
            if (ancestorIds.length === 0 && (!hasChildNodes || !branchExpanded)) {
                focusNode(nodeId);
                pendingRadialFocusNodeIdRef.current = null;
            }
        }
    }, [
        commands,
        expandedBranchNodeIds,
        focusNode,
        isRadialLayout,
        persistedParentById,
        radialOverviewNodeById,
        setSelectedNodes,
    ]);

    const setLayoutMode = useCallback((nextLayout: 'force' | 'radial') => {
        const nextParams = new URLSearchParams(searchParams.toString());
        if (nextLayout === 'force') {
            nextParams.delete('layout');
        } else {
            nextParams.set('layout', nextLayout);
        }
        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }, [pathname, router, searchParams]);

    const layoutToggle = (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-full border border-slate-200 bg-white/92 p-1 shadow-sm backdrop-blur-sm">
            {(['force', 'radial'] as const).map((mode) => {
                const active = persistedLayoutMode === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        className={[
                            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200',
                            active
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:bg-slate-100',
                        ].join(' ')}
                        onClick={() => setLayoutMode(mode)}
                    >
                        {mode === 'force' ? 'Force' : 'Radial'}
                    </button>
                );
            })}
            <button
                type="button"
                className={[
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 border',
                    autoRouteEdgeHandles
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-100',
                ].join(' ')}
                onClick={() => setStreamPreferences({ autoRouteEdgeHandles: !autoRouteEdgeHandles })}
                title="Toggle nearest-side edge routing"
            >
                Auto Side
            </button>
        </div>
    );

    if (isRadialLayout) {
        return (
            <div className="relative h-full w-full">
                {layoutToggle}
                <RadialOverview
                    nodes={radialOverviewNodes as GraphNodeRender[]}
                    rootIds={radialOverviewGraph.rootIds}
                    depthById={radialOverviewGraph.depthById}
                    selectedNodeIds={selectedNodeIds}
                    onActivateNode={activateRadialNode}
                    onToggleBranch={commands.toggleBranch}
                />
            </div>
        );
    }

    return (
        <div className="relative h-full w-full" onDoubleClick={handlePaneDoubleClick}>
            {layoutToggle}
            <SelectedNodePanel />
            <div className="group absolute bottom-4 right-4 z-20 h-[400px] w-[480px] overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/88 shadow-lg backdrop-blur-sm transition-all duration-300 ease-out hover:h-[540px] hover:w-[680px]">
                <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-2">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Radial Overview</p>
                        <p className="text-xs text-slate-600">Hover to enlarge, drag to pan, hover segments to navigate</p>
                    </div>
                    <button
                        type="button"
                        className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
                        onClick={() => setLayoutMode('radial')}
                    >
                        Open full
                    </button>
                </div>
                <div className="h-[calc(100%-53px)]">
                    <RadialOverview
                        nodes={radialOverviewNodes as GraphNodeRender[]}
                        rootIds={radialOverviewGraph.rootIds}
                        depthById={radialOverviewGraph.depthById}
                        selectedNodeIds={selectedNodeIds}
                        onActivateNode={activateRadialNode}
                        onToggleBranch={commands.toggleBranch}
                        zoomBias={1.35}
                        compactMode
                    />
                </div>
            </div>
            <ReactFlow
                nodes={emphasizedDisplayNodes as GraphNodeRender[]}
                edges={displayEdges}
                defaultEdgeOptions={{
                    style: { stroke: '#475569', strokeWidth: 2, strokeOpacity: 0.72 },
                }}
                onlyRenderVisibleElements={false}
                defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
                proOptions={{ hideAttribution: true }}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    if (node.type === 'selectionHeader' || node.type === 'selectionNode') {
                        return;
                    }
                    const target = event.target;
                    if (
                        target instanceof HTMLElement
                        && target.closest('button, input, textarea, label, [role="button"], [data-stop-node-click="true"]')
                    ) {
                        return;
                    }

                    if (event.shiftKey) {
                        const currentIds = selectedNodeIdsRef.current;
                        const alreadySelected = currentIds.includes(node.id);
                        if (alreadySelected) {
                            const nextIds = currentIds.filter((selectedId) => selectedId !== node.id);
                            setSelectedNodes(nextIds);
                            setActiveNode(null);
                        } else {
                            setSelectedNodes([...currentIds, node.id]);
                            setActiveNode(node.id);
                        }
                        return;
                    }

                    toggleExpandedNode(node.id);
                    focusNode(node.id);
                }}
                onNodeDoubleClick={(_event: React.MouseEvent, node: Node) => {
                    reactFlowInstance.setCenter(
                        node.position.x + 170,
                        node.position.y + 90,
                        { duration: 300, zoom: Math.max(reactFlowInstance.getZoom(), 0.9) },
                    );
                }}
                onSelectionChange={handleSelectionChange}
                onSelectionStart={(event: React.MouseEvent | React.TouchEvent) => {
                    const point = readClientPoint(event);
                    shiftMarqueeStartRef.current = point
                        ? reactFlowInstance.screenToFlowPosition({ x: point.x, y: point.y })
                        : null;
                    isShiftMarqueeSelectionRef.current = Boolean('shiftKey' in event && event.shiftKey);
                }}
                onSelectionEnd={(event: React.MouseEvent | React.TouchEvent) => {
                    if (isShiftMarqueeSelectionRef.current) {
                        const start = shiftMarqueeStartRef.current;
                        const endPoint = readClientPoint(event);
                        const end = endPoint
                            ? reactFlowInstance.screenToFlowPosition({ x: endPoint.x, y: endPoint.y })
                            : null;

                        if (start && end) {
                            const minX = Math.min(start.x, end.x);
                            const maxX = Math.max(start.x, end.x);
                            const minY = Math.min(start.y, end.y);
                            const maxY = Math.max(start.y, end.y);

                            const idsToRemove = emphasizedDisplayNodes
                                .filter((node) => node.type === 'customTask')
                                .filter((node) => {
                                    const { width, height } = getDisplayNodeDimensions(node as GraphNodeRender);
                                    const nodeMinX = node.position.x;
                                    const nodeMaxX = node.position.x + width;
                                    const nodeMinY = node.position.y;
                                    const nodeMaxY = node.position.y + height;
                                    return !(nodeMaxX < minX || nodeMinX > maxX || nodeMaxY < minY || nodeMinY > maxY);
                                })
                                .map((node) => node.id);

                            if (idsToRemove.length > 0) {
                                const current = selectedNodeIdsRef.current;
                                const nextIds = current.filter((id) => !idsToRemove.includes(id));
                                if (nextIds.length !== current.length) {
                                    setSelectedNodes(nextIds);
                                }
                            }
                        }
                    }

                    shiftMarqueeStartRef.current = null;
                    isShiftMarqueeSelectionRef.current = false;
                }}
                onPaneClick={() => {
                    setActiveNode(null);
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                panOnScroll
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Meta"
                fitView
            >
                <Background color="var(--border)" gap={24} size={1} />
                <Controls className="!rounded-md !border-border/40 !bg-white !shadow-sm" />
                <MiniMap
                    className="!rounded-md !border-border/40 !bg-white !shadow-sm"
                    maskColor="rgba(0,0,0,0.05)"
                    nodeColor={() => 'var(--primary)'}
                />
            </ReactFlow>
        </div>
    );
}

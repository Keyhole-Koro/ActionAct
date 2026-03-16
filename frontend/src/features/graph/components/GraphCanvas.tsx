"use client";

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { projectSelectionGroups } from '@/features/agentInteraction/selectors/projectSelectionGroups';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';

import { GraphNodeCard } from './GraphNodeCard';
import { RadialOverview } from './RadialOverview';
import { SelectionHeaderNodeCard, SelectionOptionNodeCard } from './SelectionGroupNodes';
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

function getDisplayNodeDimensions(node: GraphNodeRender) {
    if (node.data?.layoutMode === 'radial' && node.data?.nodeSource === 'persisted') {
        const radialDepth = typeof node.data.radialDepth === 'number' ? node.data.radialDepth : 0;
        const size = radialDepth === 0 ? 132 : (radialDepth === 1 ? 120 : (radialDepth === 2 ? 110 : 96));
        return { width: size, height: size };
    }

    const nodeKind = typeof node.data?.kind === 'string' ? node.data.kind : undefined;
    const label = typeof node.data?.label === 'string' ? node.data.label : undefined;
    const isExpanded = node.data?.isExpanded === true;
    const hasChildNodes = node.data?.hasChildNodes === true;
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

function overlapsWithMargin(left: GraphNodeRender, right: GraphNodeRender, margin = 28) {
    const leftDimensions = getDisplayNodeDimensions(left);
    const rightDimensions = getDisplayNodeDimensions(right);

    return !(
        left.position.x + leftDimensions.width + margin < right.position.x - margin
        || left.position.x - margin > right.position.x + rightDimensions.width + margin
        || left.position.y + leftDimensions.height + margin < right.position.y - margin
        || left.position.y - margin > right.position.y + rightDimensions.height + margin
    );
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
        addQueryActNode,
        addEmptyActNode,
        setPersistedGraph,
        setActGraph,
        editingNodeId,
        selectedNodeIds,
        expandedNodeIds,
        expandedBranchNodeIds,
        streamingNodeIds,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
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
        const expandedNodes = normalizedDisplayNodes.filter((node) => node.data?.isExpanded === true);
        if (expandedNodes.length === 0) {
            return normalizedDisplayNodes;
        }

        return normalizedDisplayNodes.map((node) => {
            if (node.type !== 'customTask') {
                return node;
            }
            const isExpanded = node.data?.isExpanded === true;
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

            return buildDisplayEdges(
                [...persistedGraph.hierarchyEdges, ...persistedGraph.relationEdges],
                [...actEdges, ...selectionProjection.edges],
            ).map((edge) => {
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

            return {
                ...edge,
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

    const activateRadialNode = useCallback((nodeId: string) => {
        setSelectedNodes([nodeId]);
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
                        setSelectedNodes(
                            selectedNodeIds.includes(node.id)
                                ? selectedNodeIds.filter((selectedId) => selectedId !== node.id).sort()
                                : [...selectedNodeIds, node.id].sort(),
                        );
                        setActiveNode(node.id);
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
                onPaneClick={() => {
                    setSelectedNodes([]);
                    setActiveNode(null);
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                panOnScroll
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
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

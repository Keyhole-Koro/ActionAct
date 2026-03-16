"use client";

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    Background,
    Controls,
    Edge,
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
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';

import { GraphNodeCard } from './GraphNodeCard';
import { buildDisplayEdges, buildDisplayNodes } from '../selectors/projectGraph';
import { projectPersistedGraph } from '../selectors/projectPersistedGraph';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';
import { createPersistedGraphMock } from '../mocks/persistedGraphMock';

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
};

function isRenderableCoordinate(value: number | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 20000;
}

export function GraphCanvas() {
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
    const commands = useGraphCommands({ workspaceId, topicId });
    const reactFlowInstance = useReactFlow();

    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);
    const previousViewSignatureRef = useRef<string | null>(null);
    const usePersistedGraphMock = useMemo(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return new URLSearchParams(window.location.search).get('graphMock') === '1';
    }, []);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
        if (usePersistedGraphMock) {
            const mock = createPersistedGraphMock(topicId);
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
        if (expandedBranchNodeIds.length > 0) {
            return expandedBranchNodeIds;
        }

        const allPersistedIds = new Set((persistedNodes as GraphNodeBase[]).map((node) => node.id));
        return (persistedNodes as GraphNodeBase[])
            .filter((node) => {
                const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : undefined;
                return !parentId || !allPersistedIds.has(parentId);
            })
            .map((node) => node.id);
    }, [expandedBranchNodeIds, persistedNodes]);

    const persistedGraph = useMemo(
        () => projectPersistedGraph(
            persistedNodes as GraphNodeBase[],
            persistedEdges,
            effectiveExpandedBranchNodeIds,
            expandedNodeIds,
        ),
        [effectiveExpandedBranchNodeIds, expandedNodeIds, persistedEdges, persistedNodes],
    );

    const graphNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...(actNodes as GraphNodeBase[])],
        [actNodes, persistedGraph.positionedNodes],
    );

    const allReferenceableNodes = useMemo(
        () => [...persistedGraph.positionedNodes, ...actNodes],
        [actNodes, persistedGraph.positionedNodes],
    );

    const displayNodes = useMemo(
        () => buildDisplayNodes({
            nodes: graphNodes,
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
            graphNodes,
            persistedGraph.childrenByParent,
            persistedGraph.visibleNodeIds,
            selectedNodeIds,
            streamingNodeIds,
        ],
    );

    const normalizedDisplayNodes = useMemo(() => {
        const safeDisplayNodes = displayNodes.map((node, index) => {
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
    }, [displayNodes]);

    const displayEdges = useMemo(
        () => buildDisplayEdges(
            [...persistedGraph.hierarchyEdges, ...persistedGraph.relationEdges],
            actEdges,
        ).map((edge) => ({
            ...edge,
            zIndex: (edge as Edge).zIndex ?? 60,
            style: {
                stroke: 'var(--primary)',
                strokeWidth: 3,
                strokeOpacity: 1,
                ...((edge as Edge).style ?? {}),
            },
        })),
        [actEdges, persistedGraph.hierarchyEdges, persistedGraph.relationEdges],
    );

    const focusNode = useCallback((nodeId: string) => {
        const targetNode = normalizedDisplayNodes.find((node) => node.id === nodeId);
        if (!targetNode) {
            return;
        }

        setActiveNode(targetNode.id);
        const nextZoom = reactFlowInstance.getZoom() > 1.1
            ? 0.92
            : reactFlowInstance.getZoom();
        reactFlowInstance.setCenter(
            targetNode.position.x + 170,
            targetNode.position.y + 90,
            { duration: 240, zoom: nextZoom },
        );
    }, [normalizedDisplayNodes, reactFlowInstance, setActiveNode]);

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
            nodeIds: normalizedDisplayNodes.map((node) => node.id),
            edgeIds: displayEdges.map((edge) => edge.id),
        }),
        [displayEdges, normalizedDisplayNodes],
    );

    useEffect(() => {
        if (normalizedDisplayNodes.length === 0) {
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
    }, [normalizedDisplayNodes.length, reactFlowInstance, viewSignature]);

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

        const selectedNodes = normalizedDisplayNodes.filter((node) => selectedNodeIds.includes(node.id));
        if (selectedNodes.length === 0) {
            return;
        }

        const averageX = selectedNodes.reduce((sum, node) => sum + node.position.x, 0) / selectedNodes.length;
        const maxY = selectedNodes.reduce((max, node) => Math.max(max, node.position.y), selectedNodes[0].position.y);
        addQueryActNode({ x: averageX, y: maxY + 240 }, event.key);
        event.preventDefault();
    }, [addQueryActNode, editingNodeId, normalizedDisplayNodes, selectedNodeIds]);

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

    return (
        <div className="relative h-full w-full" onDoubleClick={handlePaneDoubleClick}>
            <ReactFlow
                nodes={normalizedDisplayNodes as GraphNodeRender[]}
                edges={displayEdges}
                defaultEdgeOptions={{
                    style: { stroke: '#475569', strokeWidth: 2, strokeOpacity: 0.72 },
                }}
                onlyRenderVisibleElements={false}
                defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
                proOptions={{ hideAttribution: true }}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
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

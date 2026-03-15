"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    ReactFlow,
    SelectionMode,
    type NodeChange,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PlusSquare, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { organizeService } from '@/services/organize';
import { useGraphCommands } from '@/features/graph/hooks/useGraphCommands';
import { useGraphCache } from '@/features/graph/hooks/useGraphCache';
import { useGraphStore } from '@/features/graph/store';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { actDraftService } from '@/services/actDraft/firestore';
import { GraphNodeCard } from './GraphNodeCard';
import { SelectionGroupHeader } from './SelectionGroupHeader';
import { SelectionNodeCard } from './SelectionNodeCard';
import { toSelectionFlow } from '../selectors/toSelectionFlow';
import { buildDisplayEdges, buildDisplayNodes, buildLayoutInput, buildVisibleTree, mergeTreeWithActNodes } from '../selectors/projectGraph';
import { getLayoutedElements } from '../utils/layout';
import type { GraphNodeBase, GraphNodeRender, PersistedNodeData } from '../types';

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
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
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
        addEmptyActNode,
        addQueryActNode,
        setPersistedGraph,
        setActGraph,
        editingNodeId,
        selectedNodeIds,
        expandedNodeIds,
        expandedBranchNodeIds,
        streamingNodeIds,
        isStreaming,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const { groups } = useAgentInteractionStore();
    const commands = useGraphCommands({ workspaceId, topicId });
    const [, , reactFlowOnNodesChange] = useNodesState<Node>([]);
    const [, , onEdgesChange] = useEdgesState<Edge>([]);
    const reactFlowInstance = useReactFlow();
    const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
    const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);
    const [manualNodeIds, setManualNodeIds] = useState<string[]>([]);
    const previousLayoutRef = useRef<Node[]>([]);
    const nodeClickTimeoutRef = useRef<number | null>(null);

    useGraphCache({
        kind: 'persisted',
        workspaceId,
        nodes: persistedNodes,
        edges: persistedEdges,
        setGraph: setPersistedGraph,
    });

    // Stable refs so subscription doesn't depend on store identity
    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
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

            // Guard: don't clear existing graph on transient empty snapshots
            if (nextPersistedNodes.length === 0 && persistedNodeCountRef.current > 0) {
                return;
            }
            persistedNodeCountRef.current = nextPersistedNodes.length;

            setPersistedGraphRef.current(nextPersistedNodes, nextPersistedEdges);
        });

        return () => unsubscribe();
    }, [topicId, workspaceId]);

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

    const persistedTree = useMemo(
        () => buildVisibleTree(persistedNodes as GraphNodeBase[], persistedEdges, expandedBranchNodeIds),
        [expandedBranchNodeIds, persistedEdges, persistedNodes],
    );

    const { mergedTreeNodes, standaloneActNodes } = useMemo(
        () => mergeTreeWithActNodes(
            persistedTree.visibleNodes,
            persistedNodes as GraphNodeBase[],
            actNodes as GraphNodeBase[],
        ),
        [actNodes, persistedNodes, persistedTree.visibleNodes],
    );

    const { layoutInputNodes, layoutInputEdges } = useMemo(
        () => buildLayoutInput(mergedTreeNodes, persistedTree.visibleEdges, expandedNodeIds),
        [expandedNodeIds, mergedTreeNodes, persistedTree.visibleEdges],
    );

    const topologySignature = useMemo(
        () => JSON.stringify({
            nodes: [...layoutInputNodes, ...standaloneActNodes].map((node) => ({
                id: node.id,
                type: node.type,
                manual: Boolean(node.data?.isManualPosition),
            })),
            edges: [...layoutInputEdges, ...actEdges].map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
            })),
        }),
        [actEdges, layoutInputEdges, layoutInputNodes, standaloneActNodes],
    );

    useEffect(() => {
        let mounted = true;
        getLayoutedElements(layoutInputNodes, layoutInputEdges, 'LR', { nodes: previousLayoutRef.current }).then((result) => {
            if (!mounted) {
                return;
            }
            setLayoutedNodes(result.nodes);
            setLayoutedEdges(result.edges);
            previousLayoutRef.current = result.nodes;
        });
        return () => {
            mounted = false;
        };
    }, [layoutInputEdges, layoutInputNodes, topologySignature]);

    const allReferenceableNodes = useMemo(
        () => [...persistedTree.visibleNodes, ...actNodes],
        [actNodes, persistedTree.visibleNodes],
    );

    const regularDisplayNodes = useMemo(
        () => buildDisplayNodes({
            layoutInputNodes: layoutInputNodes as GraphNodeBase[],
            standaloneActNodes: standaloneActNodes as GraphNodeBase[],
            layoutedNodes,
            manualNodeIds,
            selectedNodeIds,
            expandedBranchNodeIds,
            visiblePersistedNodeIds: persistedTree.visibleNodeIds,
            childrenByParent: persistedTree.childrenByParent,
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
        }),
        [
            allReferenceableNodes,
            commands,
            editingNodeId,
            expandedBranchNodeIds,
            expandedNodeIds,
            layoutInputNodes,
            layoutedNodes,
            manualNodeIds,
            persistedTree.childrenByParent,
            persistedTree.visibleNodeIds,
            selectedNodeIds,
            standaloneActNodes,
            streamingNodeIds,
        ],
    );

    const { nodes: selectionOverlayNodes, edges: selectionOverlayEdges } = useMemo(
        () => toSelectionFlow(groups, regularDisplayNodes),
        [groups, regularDisplayNodes],
    );

    const displayNodes = useMemo(
        () => [...regularDisplayNodes, ...selectionOverlayNodes],
        [regularDisplayNodes, selectionOverlayNodes],
    );
    const safeDisplayNodes = useMemo(
        () => displayNodes.map((node, index) => {
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
        }),
        [displayNodes],
    );
    const normalizedDisplayNodes = useMemo(() => {
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
    }, [safeDisplayNodes]);
    const displayEdges = useMemo(
        () => buildDisplayEdges(layoutedEdges, layoutInputEdges, actEdges, selectionOverlayEdges),
        [actEdges, layoutInputEdges, layoutedEdges, selectionOverlayEdges],
    );

    // fitView when node positions or counts change, but not on content/selection updates
    const positionSignature = useMemo(
        () => JSON.stringify(normalizedDisplayNodes.map(n => [n.id, Math.round(n.position.x), Math.round(n.position.y)])),
        [normalizedDisplayNodes]
    );
    const previousPositionSignatureRef = useRef<string | null>(null);

    useEffect(() => {
        if (normalizedDisplayNodes.length === 0) {
            previousPositionSignatureRef.current = null;
            return;
        }

        if (positionSignature === previousPositionSignatureRef.current) {
            return;
        }
        previousPositionSignatureRef.current = positionSignature;

        const timeoutId = window.setTimeout(() => {
            reactFlowInstance.fitView({
                duration: 250,
                padding: 0.18,
                minZoom: 0.2,
                maxZoom: 1.2,
            });
        }, 50);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [normalizedDisplayNodes.length, positionSignature, reactFlowInstance]);

    const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        // Offset by half the default node dimensions to center it on the cursor
        // Width: 340 -> 170, Height: ~100 -> 50
        addEmptyActNode({
            x: position.x - 170,
            y: position.y - 50,
        });
    }, [addEmptyActNode, reactFlowInstance]);

    const handleCreateActNode = useCallback(() => {
        const viewport = reactFlowInstance.getViewport();
        const position = reactFlowInstance.screenToFlowPosition({
            x: window.innerWidth * 0.55,
            y: window.innerHeight * 0.35,
        });
        addEmptyActNode({
            x: position.x - viewport.x,
            y: position.y - viewport.y,
        });
    }, [addEmptyActNode, reactFlowInstance]);

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

        const selectedNodes = regularDisplayNodes.filter((node) => selectedNodeIds.includes(node.id));
        if (selectedNodes.length === 0) {
            return;
        }

        const averageX = selectedNodes.reduce((sum, node) => sum + node.position.x, 0) / selectedNodes.length;
        const maxY = selectedNodes.reduce((max, node) => Math.max(max, node.position.y), selectedNodes[0].position.y);
        addQueryActNode({ x: averageX, y: maxY + 240 }, event.key);
        event.preventDefault();
    }, [addQueryActNode, editingNodeId, regularDisplayNodes, selectedNodeIds]);

    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        reactFlowOnNodesChange(changes);

        const completedMoves = changes
            .filter((change): change is Extract<NodeChange<Node>, { type: 'position' }> => (
                change.type === 'position' && change.dragging === false
            ))
            .map((change) => change.id);

        if (completedMoves.length === 0) {
            return;
        }

        setManualNodeIds((currentIds) => {
            const nextIds = new Set(currentIds);
            completedMoves.forEach((id) => nextIds.add(id));
            return [...nextIds];
        });
    }, [reactFlowOnNodesChange]);

    useEffect(() => {
        window.addEventListener('keydown', handleSelectionTyping);
        return () => window.removeEventListener('keydown', handleSelectionTyping);
    }, [handleSelectionTyping]);

    useEffect(() => () => {
        if (nodeClickTimeoutRef.current !== null) {
            window.clearTimeout(nodeClickTimeoutRef.current);
        }
    }, []);

    const handleWrapperDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains('react-flow__pane')) {
            handlePaneDoubleClick(event);
        }
    }, [handlePaneDoubleClick]);

    return (
        <div className="relative w-full h-full" onDoubleClick={handleWrapperDoubleClick}>
            <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg bg-background/95 shadow-sm backdrop-blur-sm"
                    onClick={handleCreateActNode}
                >
                    <PlusSquare className="mr-1.5 h-4 w-4" />
                    New ACT
                </Button>
                {actNodes.length > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-lg bg-background/95 shadow-sm backdrop-blur-sm"
                        onClick={() => {
                            void commands.clearAct();
                        }}
                        disabled={isStreaming}
                    >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Clear ACT
                    </Button>
                )}
            </div>
            <ReactFlow
                nodes={normalizedDisplayNodes as GraphNodeRender[]}
                edges={displayEdges}
                onlyRenderVisibleElements={false}
                defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
                proOptions={{ hideAttribution: true }}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    if (event.shiftKey) {
                        setSelectedNodes(
                            selectedNodeIds.includes(node.id)
                                ? selectedNodeIds.filter((selectedId) => selectedId !== node.id).sort()
                                : [...selectedNodeIds, node.id].sort(),
                        );
                        setActiveNode(node.id);
                        return;
                    }

                    if (nodeClickTimeoutRef.current !== null) {
                        window.clearTimeout(nodeClickTimeoutRef.current);
                    }

                    nodeClickTimeoutRef.current = window.setTimeout(() => {
                        setActiveNode(node.id);
                        toggleExpandedNode(node.id);
                        const nextZoom = reactFlowInstance.getZoom() > 1.1
                            ? 0.92
                            : reactFlowInstance.getZoom();
                        reactFlowInstance.setCenter(
                            node.position.x + 170,
                            node.position.y + 90,
                            { duration: 240, zoom: nextZoom },
                        );
                        nodeClickTimeoutRef.current = null;
                    }, 220);
                }}
                onNodeDoubleClick={(_event: React.MouseEvent, node: Node) => {
                    if (nodeClickTimeoutRef.current !== null) {
                        window.clearTimeout(nodeClickTimeoutRef.current);
                        nodeClickTimeoutRef.current = null;
                    }
                    reactFlowInstance.setCenter(
                        node.position.x + 170,
                        node.position.y + 90,
                        { duration: 300, zoom: Math.max(reactFlowInstance.getZoom(), 0.9) },
                    );
                }}
                onPaneClick={(event) => {
                    if (event.detail >= 2) {
                        handlePaneDoubleClick(event);
                        return;
                    }
                    setSelectedNodes([]);
                    setActiveNode(null);
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                nodesDraggable
                panOnScroll
                selectionOnDrag
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
                fitView
            >
                <Background color="hsl(var(--primary) / 0.1)" gap={24} size={1} />
                <Controls className="!bg-white !border-border/40 !rounded-md !shadow-sm" />
                <MiniMap
                    className="!bg-white !border-border/40 !rounded-md !shadow-sm"
                    maskColor="rgba(0,0,0,0.05)"
                    nodeColor={() => 'hsl(var(--primary))'}
                />
            </ReactFlow>
        </div>
    );
}

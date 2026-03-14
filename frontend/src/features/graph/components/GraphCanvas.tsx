"use client";

import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    useReactFlow,
    SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphNodeCard } from './GraphNodeCard';
import { organizeService } from '@/services/organize';
import { TopicNode } from '@/services/organize/port';
import { useGraphStore } from '@/features/graph/store';
import { usePanelStore } from '@/features/layout/store/panel-store';
import { useRunContextStore } from '@/features/context/store/run-context-store';

import { SelectionGroupHeader } from './SelectionGroupHeader';
import { SelectionNodeCard } from './SelectionNodeCard';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { toSelectionFlow } from '../selectors/toSelectionFlow';
import { getLayoutedElements } from '../utils/layout';

const nodeTypes = {
    customTask: GraphNodeCard,
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
};

function persistedGraphCacheKey(workspaceId: string, topicId: string) {
    return `graph.persisted.${workspaceId}.${topicId}`;
}

function actGraphCacheKey(workspaceId: string, topicId: string) {
    return `graph.act.${workspaceId}.${topicId}`;
}

function serializePersistedGraph(nodes: Node[], edges: Edge[]) {
    return JSON.stringify({ nodes, edges });
}

function deserializePersistedGraph(rawValue: string | null): { nodes: Node[]; edges: Edge[] } | null {
    if (!rawValue) {
        return null;
    }

    try {
        const parsed = JSON.parse(rawValue) as { nodes?: Node[]; edges?: Edge[] };
        return {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
            edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        };
    } catch {
        return null;
    }
}

export function GraphCanvas() {
    const { setMode, openPanel } = usePanelStore();
    const {
        persistedNodes,
        persistedEdges,
        nodes: actNodes,
        edges: actEdges,
        setSelectedNodes,
        setActiveNode,
        addEmptyNode,
        setPersistedGraph,
        setDraftGraph,
        setActGraph,
        editingNodeId,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const [, , onNodesChange] = useNodesState<Node>([]);
    const [, , onEdgesChange] = useEdgesState<Edge>([]);
    const reactFlowInstance = useReactFlow();
    const hydratedPersistedCacheKeyRef = useRef<string | null>(null);
    const hydratedActCacheKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const cacheKey = persistedGraphCacheKey(workspaceId, topicId);
        if (hydratedPersistedCacheKeyRef.current === cacheKey) {
            return;
        }

        hydratedPersistedCacheKeyRef.current = cacheKey;
        const cachedGraph = deserializePersistedGraph(window.localStorage.getItem(cacheKey));
        if (cachedGraph && cachedGraph.nodes.length > 0) {
            setPersistedGraph(cachedGraph.nodes, cachedGraph.edges);
        }
    }, [setPersistedGraph, topicId, workspaceId]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const cacheKey = actGraphCacheKey(workspaceId, topicId);
        if (hydratedActCacheKeyRef.current === cacheKey) {
            return;
        }

        hydratedActCacheKeyRef.current = cacheKey;
        const cachedGraph = deserializePersistedGraph(window.localStorage.getItem(cacheKey));
        if (cachedGraph) {
            setActGraph(cachedGraph.nodes, cachedGraph.edges);
            return;
        }

        setActGraph([], []);
    }, [setActGraph, topicId, workspaceId]);

    useEffect(() => {
        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes: TopicNode[]) => {
            const rfNodes: Node[] = topicNodes.map((n, i) => ({
                id: n.id,
                type: 'customTask',
                position: { x: 120, y: i * 180 + 80 },
                data: {
                    label: n.title,
                    type: n.type,
                    contextSummary: n.contextSummary,
                    detailHtml: n.detailHtml,
                    contentMd: n.contentMd,
                    evidenceRefs: n.evidenceRefs,
                },
            }));

            const rfEdges: Edge[] = topicNodes
                .filter(n => n.parentId)
                .map(n => ({
                    id: `e-${n.parentId}-${n.id}`,
                    source: n.parentId!,
                    target: n.id,
                    animated: true,
                }));

            if (rfNodes.length === 0 && persistedNodes.length > 0) {
                return;
            }

            setPersistedGraph(rfNodes, rfEdges);

            if (typeof window !== 'undefined' && rfNodes.length > 0) {
                window.localStorage.setItem(
                    persistedGraphCacheKey(workspaceId, topicId),
                    serializePersistedGraph(rfNodes, rfEdges),
                );
            }
        });

        return () => unsubscribe();
    }, [persistedNodes.length, setPersistedGraph, workspaceId, topicId]);

    useEffect(() => {
        setDraftGraph([], []);
    }, [setDraftGraph, topicId, workspaceId]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (actNodes.length === 0 && actEdges.length === 0) {
            return;
        }

        window.localStorage.setItem(
            actGraphCacheKey(workspaceId, topicId),
            serializePersistedGraph(actNodes, actEdges),
        );
    }, [actEdges, actNodes, topicId, workspaceId]);

    const { groups } = useAgentInteractionStore();
    const selectionBaseNodes = useMemo(() => [...persistedNodes], [persistedNodes]);
    const { nodes: selectionNodes, edges: selectionEdges } = useMemo(
        () => toSelectionFlow(groups, selectionBaseNodes),
        [groups, selectionBaseNodes],
    );
    const lastDebugSignature = useRef<string>('');

    // Combine all node sources
    const dedupedActNodes = useMemo(
        () => actNodes.filter((actNode) => !persistedNodes.some((node) => node.id === actNode.id)),
        [actNodes, persistedNodes],
    );
    const rawCombinedNodes = useMemo(
        () => [...persistedNodes, ...dedupedActNodes, ...selectionNodes],
        [dedupedActNodes, persistedNodes, selectionNodes],
    );
    const rawCombinedEdges = useMemo(
        () => [...persistedEdges, ...actEdges, ...selectionEdges],
        [actEdges, persistedEdges, selectionEdges],
    );

    // State for auto-layouted nodes/edges
    const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
    const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);
    const topologySignature = useMemo(
        () => JSON.stringify({
            nodes: rawCombinedNodes.map((node) => ({
                id: node.id,
                type: node.type,
                manual: Boolean(node.data?.isManualPosition),
            })),
            edges: rawCombinedEdges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
            })),
        }),
        [rawCombinedEdges, rawCombinedNodes],
    );

    useEffect(() => {
        const nodes = [
            ...persistedNodes.map((node) => ({
                id: node.id,
                source: 'persisted',
                label: typeof node.data?.label === 'string' ? node.data.label : '',
                type: typeof node.data?.type === 'string' ? node.data.type : '',
                contentLength: typeof node.data?.contentMd === 'string' ? node.data.contentMd.length : 0,
            })),
            ...actNodes.map((node) => ({
                id: node.id,
                source: 'act',
                label: typeof node.data?.label === 'string' ? node.data.label : '',
                type: typeof node.data?.type === 'string' ? node.data.type : '',
                contentLength: typeof node.data?.contentMd === 'string' ? node.data.contentMd.length : 0,
            })),
            ...selectionNodes.map((node) => ({
                id: node.id,
                source: 'selection',
                label: typeof node.data?.label === 'string' ? node.data.label : '',
                type: typeof node.data?.type === 'string' ? node.data.type : '',
                contentLength: typeof node.data?.contentMd === 'string' ? node.data.contentMd.length : 0,
            })),
        ];

        const signature = JSON.stringify({
            workspaceId,
            topicId,
            nodes,
        });

        if (signature === lastDebugSignature.current) {
            return;
        }
        lastDebugSignature.current = signature;

        console.info('[GraphCanvas] node sources', {
            workspaceId,
            topicId,
            persistedCount: persistedNodes.length,
            draftCount: 0,
            actCount: actNodes.length,
            selectionCount: selectionNodes.length,
            nodes,
        });
    }, [actNodes, persistedNodes, selectionNodes, topicId, workspaceId]);

    const displayNodes = useMemo(() => {
        const layoutById = new Map(layoutedNodes.map((node) => [node.id, node]));
        return rawCombinedNodes.map((node) => {
            const layoutedNode = layoutById.get(node.id);
            if (!layoutedNode) {
                return node;
            }
            return {
                ...node,
                position: layoutedNode.position,
                sourcePosition: layoutedNode.sourcePosition,
                targetPosition: layoutedNode.targetPosition,
            };
        });
    }, [layoutedNodes, rawCombinedNodes]);

    const displayEdges = useMemo(
        () => (layoutedEdges.length > 0 ? layoutedEdges : rawCombinedEdges),
        [layoutedEdges, rawCombinedEdges],
    );

    // Apply auto-layout asynchronously only when topology changes
    useEffect(() => {
        let mounted = true;
        getLayoutedElements(rawCombinedNodes, rawCombinedEdges, 'TB').then((res) => {
            if (mounted) {
                setLayoutedNodes(res.nodes);
                setLayoutedEdges(res.edges);
            }
        });
        return () => { mounted = false; };
    }, [topologySignature, rawCombinedEdges, rawCombinedNodes]);

    // Canvas double-click → create empty node
    const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        addEmptyNode(position);
    }, [reactFlowInstance, addEmptyNode]);

    // Track last click time for manual double-click detection
    const lastClickTime = useRef<number>(0);

    return (
        <div className="w-full h-full pb-20">
            <ReactFlow
                nodes={displayNodes}
                edges={displayEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onSelectionChange={({ nodes }: { nodes: Node[] }) => {
                    setSelectedNodes(nodes.map((n: Node) => n.id));
                }}
                onNodeClick={(_event: React.MouseEvent, node: Node) => {
                    setActiveNode(node.id);
                    if (editingNodeId !== node.id) {
                        setMode('node-detail');
                        openPanel('node-detail', node.id);
                    }
                }}
                onPaneClick={(event) => {
                    const now = Date.now();
                    const timeDiff = now - lastClickTime.current;
                    lastClickTime.current = now;

                    if (timeDiff < 400) {
                        // Detected a double click!
                        handlePaneDoubleClick(event);
                    } else {
                        // Single click
                        setActiveNode(null);
                    }
                }}
                zoomOnDoubleClick={false}
                nodeTypes={nodeTypes}
                panOnScroll={true}
                selectionOnDrag={true}
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
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

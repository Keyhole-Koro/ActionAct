"use client";

import React, { useEffect, useCallback, useRef, useState } from 'react';
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
    ReactFlowProvider
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
import { actDraftService } from '@/services/actDraft/firestore';

const nodeTypes = {
    customTask: GraphNodeCard,
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
};

export function GraphCanvas() {
    const { setMode, openPanel } = usePanelStore();
    const {
        persistedNodes,
        persistedEdges,
        draftNodes,
        draftEdges,
        nodes: actNodes,
        edges: actEdges,
        setSelectedNodes,
        setActiveNode,
        addEmptyNode,
        setPersistedGraph,
        setDraftGraph,
        editingNodeId,
    } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const [, , onNodesChange] = useNodesState<Node>([]);
    const [, , onEdgesChange] = useEdgesState<Edge>([]);
    const reactFlowInstance = useReactFlow();

    useEffect(() => {
        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes: TopicNode[]) => {
            const rfNodes: Node[] = topicNodes.map((n, i) => ({
                id: n.id,
                type: 'customTask',
                position: { x: 100 + (Math.random() * 200), y: i * 150 + 50 },
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

            setPersistedGraph(rfNodes, rfEdges);
        });

        return () => unsubscribe();
    }, [setPersistedGraph, workspaceId, topicId]);

    useEffect(() => {
        const unsubscribe = actDraftService.subscribeDrafts(workspaceId, topicId, (topicNodes: TopicNode[]) => {
            const rfNodes: Node[] = topicNodes.map((n, i) => ({
                id: n.id,
                type: 'customTask',
                position: { x: 420 + (Math.random() * 120), y: i * 180 + 80 },
                data: {
                    label: n.title,
                    type: n.type,
                    contentMd: n.contentMd,
                    contextSummary: n.contextSummary,
                    detailHtml: n.detailHtml,
                    evidenceRefs: n.evidenceRefs,
                    isActDraft: true,
                },
            }));

            setDraftGraph(rfNodes, []);
        });

        return () => unsubscribe();
    }, [setDraftGraph, topicId, workspaceId]);

    const { groups } = useAgentInteractionStore();
    const selectionBaseNodes = [...persistedNodes, ...draftNodes];
    const { nodes: selectionNodes, edges: selectionEdges } = toSelectionFlow(groups, selectionBaseNodes);

    // Combine all node sources
    const dedupedPersistedAndDraft = [
        ...persistedNodes,
        ...draftNodes.filter((draftNode) => !persistedNodes.some((persistedNode) => persistedNode.id === draftNode.id)),
    ];
    const dedupedActNodes = actNodes.filter((actNode) => !dedupedPersistedAndDraft.some((node) => node.id === actNode.id));
    const rawCombinedNodes = [...dedupedPersistedAndDraft, ...dedupedActNodes, ...selectionNodes];
    const rawCombinedEdges = [...persistedEdges, ...draftEdges, ...actEdges, ...selectionEdges];

    // State for auto-layouted nodes/edges
    const [layoutedNodes, setLayoutedNodes] = useState<Node[]>([]);
    const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([]);
    // Apply auto-layout asynchronously
    useEffect(() => {
        let mounted = true;
        getLayoutedElements(rawCombinedNodes, rawCombinedEdges, 'TB').then((res) => {
            if (mounted) {
                setLayoutedNodes(res.nodes);
                setLayoutedEdges(res.edges);
            }
        });
        return () => { mounted = false; };
    }, [rawCombinedNodes, rawCombinedEdges]);

    // Canvas double-click → create empty node
    const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
        console.log("handlePaneDoubleClick called!", event.clientX, event.clientY);
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
                nodes={layoutedNodes}
                edges={layoutedEdges}
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
                    if (node.data?.isActDraft) {
                        void actDraftService.touchDraft(workspaceId, topicId, node.id);
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
                <Background color="hsl(var(--primary) / 0.15)" gap={24} size={2} />
                <Controls className="!bg-card/80 !border-border/40 !rounded-xl !shadow-lg backdrop-blur-md" />
                <MiniMap
                    className="!bg-card/80 !border-border/40 !rounded-xl !shadow-lg backdrop-blur-md"
                    maskColor="rgba(0,0,0,0.1)"
                    nodeColor={() => 'hsl(var(--primary))'}
                />
            </ReactFlow>
        </div>
    );
}

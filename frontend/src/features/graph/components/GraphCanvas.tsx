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

const nodeTypes = {
    customTask: GraphNodeCard,
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
};

export function GraphCanvas() {
    const { setMode, openPanel } = usePanelStore();
    const { nodes: actNodes, edges: actEdges, setSelectedNodes, setActiveNode, addEmptyNode, editingNodeId } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const reactFlowInstance = useReactFlow();

    useEffect(() => {
        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes: TopicNode[]) => {
            const rfNodes: Node[] = topicNodes.map((n, i) => ({
                id: n.id,
                type: 'customTask',
                position: { x: 100 + (Math.random() * 200), y: i * 150 + 50 },
                data: { label: n.title, type: n.type },
            }));

            const rfEdges: Edge[] = topicNodes
                .filter(n => n.parentId)
                .map(n => ({
                    id: `e-${n.parentId}-${n.id}`,
                    source: n.parentId!,
                    target: n.id,
                    animated: true,
                }));

            setNodes(rfNodes);
            setEdges(rfEdges);
        });

        return () => unsubscribe();
    }, [setNodes, setEdges, workspaceId, topicId]);

    const { groups } = useAgentInteractionStore();
    const { nodes: selectionNodes, edges: selectionEdges } = toSelectionFlow(groups, nodes);

    // Combine all node sources
    const rawCombinedNodes = [...nodes, ...actNodes, ...selectionNodes];
    const rawCombinedEdges = [...edges, ...actEdges, ...selectionEdges];

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
        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        addEmptyNode(position);
    }, [reactFlowInstance, addEmptyNode]);

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
                    setMode('node-detail');
                    openPanel('node-detail', node.id);
                }}
                onPaneClick={(event) => {
                    if (event.detail === 2) {
                        handlePaneDoubleClick(event);
                    } else {
                        // Deselect on single click
                        setActiveNode(null);
                    }
                }}
                nodeTypes={nodeTypes}
                panOnScroll={true}
                selectionOnDrag={true}
                panOnDrag={[1, 2]}
                selectionMode={SelectionMode.Partial}
                fitView
            >
                <Background />
                <Controls />
                <MiniMap
                    className="!bg-card/80 !border-border/40 !rounded-xl"
                    maskColor="rgba(0,0,0,0.08)"
                    nodeColor={() => 'hsl(var(--primary))'}
                />
            </ReactFlow>
        </div>
    );
}

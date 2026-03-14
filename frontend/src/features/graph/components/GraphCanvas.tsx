"use client";

import React, { useEffect, useState } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    Node,
    Edge,
    useNodesState,
    useEdgesState,
    SelectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphNodeCard } from './GraphNodeCard';
import { organizeService } from '@/services/organize';
import { TopicNode } from '@/services/organize/port';
import { useKnowledgeTreeStore } from '@/features/knowledgeTree/store';
import { usePanelStore } from '@/features/layout/store/panel-store';
import { useRunContextStore } from '@/features/context/store/run-context-store';

import { SelectionGroupHeader } from './SelectionGroupHeader';
import { SelectionNodeCard } from './SelectionNodeCard';
import { useAgentInteractionStore } from '@/features/agentInteraction/store/interactionStore';
import { toSelectionFlow } from '../selectors/toSelectionFlow';

const nodeTypes = {
    customTask: GraphNodeCard,
    selectionHeader: SelectionGroupHeader,
    selectionNode: SelectionNodeCard,
};

export function GraphCanvas() {
    const { setMode, openPanel } = usePanelStore();
    const { nodes: actNodes, edges: actEdges, setSelectedNodes, setActiveNode } = useKnowledgeTreeStore();
    const { workspaceId, topicId } = useRunContextStore();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    useEffect(() => {
        // Subscribe to our organize service Mock data
        const unsubscribe = organizeService.subscribeTree(workspaceId, topicId, (topicNodes: TopicNode[]) => {

            // Transform mock data to ReactFlow structure
            const rfNodes: Node[] = topicNodes.map((n, i) => ({
                id: n.id,
                type: 'customTask',
                position: { x: 100 + (Math.random() * 200), y: i * 150 + 50 }, // Random/Naive positioning for phase 1 mock
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

    // Generate selection node flow
    const { nodes: selectionNodes, edges: selectionEdges } = toSelectionFlow(groups, nodes);

    // Combine organize nodes & edges with dynamically streamed Act nodes & edges & selection nodes
    const combinedNodes = [...nodes, ...actNodes, ...selectionNodes];
    const combinedEdges = [...edges, ...actEdges, ...selectionEdges];

    return (
        <div className="w-full h-full pb-20">
            <ReactFlow
                nodes={combinedNodes}
                edges={combinedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onSelectionChange={({ nodes }: { nodes: Node[] }) => {
                    setSelectedNodes(nodes.map((n: Node) => n.id));
                }}
                onNodeClick={(event: React.MouseEvent, node: Node) => {
                    setActiveNode(node.id);
                    setMode('node-detail');
                    openPanel('node-detail', node.id);
                }}
                nodeTypes={nodeTypes}
                panOnScroll={true}
                selectionOnDrag={true}
                panOnDrag={[1, 2]} // Middle mouse and right click pan (Left click dragging will select nodes)
                selectionMode={SelectionMode.Partial}
                fitView
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}

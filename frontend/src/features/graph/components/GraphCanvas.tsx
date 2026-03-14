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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphNodeCard } from './GraphNodeCard';
import { organizeService } from '@/services/organize';
import { TopicNode } from '@/services/organize/port';
import { useKnowledgeTreeStore } from '@/features/knowledgeTree/store';

const nodeTypes = {
    customTask: GraphNodeCard,
};

export function GraphCanvas() {
    const { nodes: actNodes, edges: actEdges } = useKnowledgeTreeStore();
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    useEffect(() => {
        // Subscribe to our organize service Mock data
        const unsubscribe = organizeService.subscribeTree('workspace-1', 'topic-1', (topicNodes: TopicNode[]) => {

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
    }, [setNodes, setEdges]);

    // Combine organize nodes & edges with dynamically streamed Act nodes & edges
    const combinedNodes = [...nodes, ...actNodes];
    const combinedEdges = [...edges, ...actEdges];

    return (
        <div className="w-full h-full pb-20">
            <ReactFlow
                nodes={combinedNodes}
                edges={combinedEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
}

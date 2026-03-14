import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';

// For phase 2, we just accumulate the node states here
// In a full implementation, this handles PatchOps completely

interface ActState {
    nodes: Node[];
    edges: Edge[];
    addOrUpdateNode: (nodeId: string, label: string, type: string) => void;
    appendContent: (nodeId: string, content: string) => void;
    clearNodes: () => void;
}

export const useKnowledgeTreeStore = create<ActState>((set) => ({
    nodes: [],
    edges: [],

    addOrUpdateNode: (nodeId, label, type) => set((state) => {
        const exists = state.nodes.find(n => n.id === nodeId);
        if (exists) {
            return {
                nodes: state.nodes.map(n =>
                    n.id === nodeId ? { ...n, data: { ...n.data, label, type } } : n
                )
            };
        }

        // New node: place it somewhere for now (ELK layout will fix this later)
        const newNode: Node = {
            id: nodeId,
            type: 'customTask',
            position: { x: 200 + (state.nodes.length * 10), y: 150 + (state.nodes.length * 100) },
            data: { label, type, contentMd: '' }
        };

        // Auto-link to root if not first node
        const newEdges = [...state.edges];
        if (state.nodes.length > 0) {
            newEdges.push({
                id: `e-${state.nodes[0].id}-${nodeId}`,
                source: state.nodes[0].id,
                target: nodeId,
                animated: true,
            });
        }

        return { nodes: [...state.nodes, newNode], edges: newEdges };
    }),

    appendContent: (nodeId, content) => set((state) => ({
        nodes: state.nodes.map(n =>
            n.id === nodeId
                ? { ...n, data: { ...n.data, contentMd: (n.data.contentMd as string || '') + content } }
                : n
        )
    })),

    clearNodes: () => set({ nodes: [], edges: [] })
}));

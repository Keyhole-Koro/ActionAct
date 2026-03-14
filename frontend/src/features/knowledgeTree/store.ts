import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';

// For phase 2, we just accumulate the node states here
// In a full implementation, this handles PatchOps completely

interface ActState {
    nodes: Node[];
    edges: Edge[];
    selectedNodeIds: string[];
    setSelectedNodes: (ids: string[]) => void;
    clearSelection: () => void;
    addOrUpdateNode: (nodeId: string, label: string, type: string) => void;
    appendContent: (nodeId: string, content: string) => void;
    clearNodes: () => void;
}

export const useKnowledgeTreeStore = create<ActState>((set) => ({
    nodes: [],
    edges: [],
    selectedNodeIds: [],

    setSelectedNodes: (ids) => set({ selectedNodeIds: ids }),
    clearSelection: () => set({ selectedNodeIds: [] }),

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

        const newEdges = [...state.edges];
        // Auto-link to root if not first node
        if (state.nodes.length > 0) {
            // If we have selected context nodes, link the newly created node to those selection inputs.
            if (state.selectedNodeIds.length > 0) {
                state.selectedNodeIds.forEach(targetId => {
                    newEdges.push({
                        id: `edge-ctx-${targetId}-${nodeId}`,
                        source: targetId,
                        target: nodeId,
                        animated: true,
                        style: { stroke: '#888', strokeDasharray: '5,5' } // Visual style for context edges
                    });
                });
            } else {
                // Fallback root linkage
                newEdges.push({
                    id: `e-${state.nodes[0].id}-${nodeId}`,
                    source: state.nodes[0].id,
                    target: nodeId,
                    animated: true,
                });
            }
        }

        // Automatically clear selection once we start generating the nodes
        return { nodes: [...state.nodes, newNode], edges: newEdges, selectedNodeIds: [] };
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

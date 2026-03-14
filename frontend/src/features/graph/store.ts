import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';

/**
 * Graph store — manages act-generated nodes, user-created nodes, edges, and selection.
 */

interface GraphState {
    persistedNodes: Node[];
    persistedEdges: Edge[];
    nodes: Node[];
    edges: Edge[];
    selectedNodeIds: string[];
    activeNodeId: string | null;
    editingNodeId: string | null;

    setSelectedNodes: (ids: string[]) => void;
    setPersistedGraph: (nodes: Node[], edges: Edge[]) => void;
    clearSelection: () => void;
    setActiveNode: (id: string | null) => void;
    setEditingNode: (id: string | null) => void;

    addOrUpdateNode: (nodeId: string, label: string, type: string) => void;
    addEmptyNode: (position: { x: number; y: number }) => string;
    updateNodeLabel: (nodeId: string, label: string) => void;
    appendContent: (nodeId: string, content: string) => void;
    removeNode: (nodeId: string) => void;
}

function sameIds(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    return left.every((id, index) => id === right[index]);
}

let _nodeCounter = 0;

export const useGraphStore = create<GraphState>((set) => ({
    persistedNodes: [],
    persistedEdges: [],
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    activeNodeId: null,
    editingNodeId: null,

    setSelectedNodes: (ids) => set((state) => (
        sameIds(state.selectedNodeIds, ids) ? state : { selectedNodeIds: ids }
    )),
    setPersistedGraph: (nodes, edges) => set({ persistedNodes: nodes, persistedEdges: edges }),
    clearSelection: () => set({ selectedNodeIds: [] }),
    setActiveNode: (id: string | null) => set({ activeNodeId: id }),
    setEditingNode: (id: string | null) => set({ editingNodeId: id }),

    addOrUpdateNode: (nodeId, label, type) => set((state) => {
        const exists = state.nodes.find(n => n.id === nodeId);
        if (exists) {
            return {
                nodes: state.nodes.map(n =>
                    n.id === nodeId ? { ...n, data: { ...n.data, label, type } } : n
                )
            };
        }

        const newNode: Node = {
            id: nodeId,
            type: 'customTask',
            position: { x: 200 + (state.nodes.length * 10), y: 150 + (state.nodes.length * 100) },
            data: { label, type, contentMd: '' }
        };

        const newEdges = [...state.edges];
        if (state.nodes.length > 0) {
            if (state.selectedNodeIds.length > 0) {
                state.selectedNodeIds.forEach(targetId => {
                    newEdges.push({
                        id: `edge-ctx-${targetId}-${nodeId}`,
                        source: targetId,
                        target: nodeId,
                        animated: true,
                        style: { stroke: '#888', strokeDasharray: '5,5' }
                    });
                });
            } else {
                newEdges.push({
                    id: `e-${state.nodes[0].id}-${nodeId}`,
                    source: state.nodes[0].id,
                    target: nodeId,
                    animated: true,
                });
            }
        }

        return { nodes: [...state.nodes, newNode], edges: newEdges, selectedNodeIds: [] };
    }),

    addEmptyNode: (position) => {
        const id = `user-node-${++_nodeCounter}-${Date.now()}`;
        set((state) => ({
            nodes: [...state.nodes, {
                id,
                type: 'customTask',
                position,
                data: { label: '', type: 'act', contentMd: '', isManualPosition: true }
            }],
            editingNodeId: id,
            activeNodeId: id,
        }));
        return id;
    },

    updateNodeLabel: (nodeId, label) => set((state) => ({
        nodes: state.nodes.map(n =>
            n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
        ),
        editingNodeId: null,
    })),

    appendContent: (nodeId, content) => set((state) => ({
        nodes: state.nodes.map(n =>
            n.id === nodeId
                ? { ...n, data: { ...n.data, contentMd: (n.data.contentMd as string || '') + content } }
                : n
        )
    })),

    removeNode: (nodeId) => set((state) => ({
        nodes: state.nodes.filter(n => n.id !== nodeId),
        edges: state.edges.filter(e => e.source !== nodeId && e.target !== nodeId),
        activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        editingNodeId: state.editingNodeId === nodeId ? null : state.editingNodeId,
    })),
}));

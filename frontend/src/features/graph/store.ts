import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';

/**
 * Graph store — manages act-generated nodes, user-created nodes, edges, and selection.
 */

interface GraphState {
    persistedNodes: Node[];
    persistedEdges: Edge[];
    draftNodes: Node[];
    draftEdges: Edge[];
    nodes: Node[];
    edges: Edge[];
    selectedNodeIds: string[];
    expandedNodeIds: string[];
    expandedBranchNodeIds: string[];
    activeNodeId: string | null;
    editingNodeId: string | null;
    isStreaming: boolean;
    streamingNodeIds: string[];

    setSelectedNodes: (ids: string[]) => void;
    setPersistedGraph: (nodes: Node[], edges: Edge[]) => void;
    setDraftGraph: (nodes: Node[], edges: Edge[]) => void;
    setActGraph: (nodes: Node[], edges: Edge[]) => void;
    clearSelection: () => void;
    setActiveNode: (id: string | null) => void;
    toggleExpandedNode: (id: string) => void;
    toggleExpandedBranchNode: (id: string) => void;
    setEditingNode: (id: string | null) => void;
    setStreamRunning: (value: boolean) => void;
    addStreamingNode: (nodeId: string) => void;
    clearStreamingNodes: (nodeIds?: string[]) => void;

    addOrUpdateNode: (nodeId: string, payload: { label?: string; kind?: string; referencedNodeIds?: string[] }) => void;
    addEmptyNode: (position: { x: number; y: number }) => string;
    addQueryNode: (position: { x: number; y: number }, initialLabel: string) => string;
    updateNodeLabel: (nodeId: string, label: string) => void;
    appendContent: (nodeId: string, content: string) => void;
    removeNode: (nodeId: string) => void;
}

function sameIds(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((id, index) => id === rightSorted[index]);
}

function preserveNodePositions(previousNodes: Node[], nextNodes: Node[]) {
    const previousById = new Map(previousNodes.map((node) => [node.id, node]));
    return nextNodes.map((node) => {
        const previous = previousById.get(node.id);
        if (!previous) {
            return node;
        }
        return {
            ...node,
            position: previous.position,
        };
    });
}

let _nodeCounter = 0;

export const useGraphStore = create<GraphState>((set) => ({
    persistedNodes: [],
    persistedEdges: [],
    draftNodes: [],
    draftEdges: [],
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    expandedNodeIds: [],
    expandedBranchNodeIds: [],
    activeNodeId: null,
    editingNodeId: null,
    isStreaming: false,
    streamingNodeIds: [],

    setSelectedNodes: (ids) => set((state) => (
        sameIds(state.selectedNodeIds, ids) ? state : { selectedNodeIds: ids }
    )),
    setPersistedGraph: (nodes, edges) => set((state) => ({
        persistedNodes: preserveNodePositions(state.persistedNodes, nodes),
        persistedEdges: edges,
    })),
    setDraftGraph: (nodes, edges) => set((state) => ({
        draftNodes: preserveNodePositions(state.draftNodes, nodes),
        draftEdges: edges,
    })),
    setActGraph: (nodes, edges) => set((state) => ({
        nodes: preserveNodePositions(state.nodes, nodes),
        edges,
    })),
    clearSelection: () => set({ selectedNodeIds: [] }),
    setActiveNode: (id: string | null) => set({ activeNodeId: id }),
    toggleExpandedNode: (id: string) => set((state) => ({
        expandedNodeIds: state.expandedNodeIds.includes(id)
            ? state.expandedNodeIds.filter((expandedId) => expandedId !== id)
            : [...state.expandedNodeIds, id],
    })),
    toggleExpandedBranchNode: (id: string) => set((state) => ({
        expandedBranchNodeIds: state.expandedBranchNodeIds.includes(id)
            ? state.expandedBranchNodeIds.filter((expandedId) => expandedId !== id)
            : [...state.expandedBranchNodeIds, id],
    })),
    setEditingNode: (id: string | null) => set({ editingNodeId: id }),
    setStreamRunning: (value: boolean) => set({ isStreaming: value }),
    addStreamingNode: (nodeId: string) => set((state) => (
        state.streamingNodeIds.includes(nodeId)
            ? state
            : { streamingNodeIds: [...state.streamingNodeIds, nodeId] }
    )),
    clearStreamingNodes: (nodeIds?: string[]) => set((state) => {
        if (!nodeIds || nodeIds.length === 0) {
            return { streamingNodeIds: [] };
        }
        const toClear = new Set(nodeIds);
        return {
            streamingNodeIds: state.streamingNodeIds.filter((nodeId) => !toClear.has(nodeId)),
        };
    }),

    addOrUpdateNode: (nodeId, payload) => set((state) => {
        const exists = state.nodes.find(n => n.id === nodeId);
        if (exists) {
            return {
                nodes: state.nodes.map(n =>
                    n.id === nodeId
                        ? {
                            ...n,
                            data: {
                                ...n.data,
                                ...(payload.label !== undefined ? { label: payload.label } : {}),
                                ...(payload.kind !== undefined ? { kind: payload.kind } : {}),
                                ...(payload.referencedNodeIds !== undefined ? { referencedNodeIds: payload.referencedNodeIds } : {}),
                            },
                        }
                        : n
                )
            };
        }

        const newNode: Node = {
            id: nodeId,
            type: 'customTask',
            position: { x: 200 + (state.nodes.length * 10), y: 150 + (state.nodes.length * 100) },
            data: {
                label: payload.label ?? '',
                kind: payload.kind ?? 'act',
                referencedNodeIds: payload.referencedNodeIds ?? [],
                contentMd: '',
            }
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
                data: { label: '', kind: 'act', contentMd: '', isManualPosition: true }
            }],
            editingNodeId: id,
            activeNodeId: id,
            expandedNodeIds: state.expandedNodeIds.includes(id)
                ? state.expandedNodeIds
                : [...state.expandedNodeIds, id],
        }));
        return id;
    },

    addQueryNode: (position, initialLabel) => {
        const id = `act-node-${++_nodeCounter}-${Date.now()}`;
        set((state) => ({
            nodes: [...state.nodes, {
                id,
                type: 'customTask',
                position,
                data: { label: initialLabel, kind: 'act', contentMd: '', isManualPosition: true }
            }],
            edges: [
                ...state.edges,
                ...state.selectedNodeIds.map((targetId) => ({
                    id: `edge-ctx-${targetId}-${id}`,
                    source: targetId,
                    target: id,
                    animated: true,
                    style: { stroke: '#888', strokeDasharray: '5,5' }
                })),
            ],
            editingNodeId: id,
            activeNodeId: id,
            expandedNodeIds: state.expandedNodeIds.includes(id)
                ? state.expandedNodeIds
                : [...state.expandedNodeIds, id],
            selectedNodeIds: [],
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
        expandedNodeIds: state.expandedNodeIds.filter((id) => id !== nodeId),
        activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        editingNodeId: state.editingNodeId === nodeId ? null : state.editingNodeId,
    })),
}));

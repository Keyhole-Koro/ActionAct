import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';

/**
 * Graph store — manages act-generated nodes, user-created nodes, edges, and selection.
 */

interface GraphState {
    persistedNodes: Node[];
    persistedEdges: Edge[];
    actNodes: Node[];
    actEdges: Edge[];
    selectedNodeIds: string[];
    expandedNodeIds: string[];
    expandedBranchNodeIds: string[];
    activeNodeId: string | null;
    editingNodeId: string | null;
    isStreaming: boolean;
    streamingNodeIds: string[];

    setSelectedNodes: (ids: string[]) => void;
    setPersistedGraph: (nodes: Node[], edges: Edge[]) => void;
    setActGraph: (nodes: Node[], edges: Edge[]) => void;
    clearActGraph: () => void;
    clearSelection: () => void;
    setActiveNode: (id: string | null) => void;
    toggleExpandedNode: (id: string) => void;
    expandNode: (id: string) => void;
    toggleExpandedBranchNode: (id: string) => void;
    expandBranchNode: (id: string) => void;
    setEditingNode: (id: string | null) => void;
    setStreamRunning: (value: boolean) => void;
    addStreamingNode: (nodeId: string) => void;
    clearStreamingNodes: (nodeIds?: string[]) => void;

    addOrUpdateActNode: (nodeId: string, payload: { label?: string; kind?: string; referencedNodeIds?: string[]; createdBy?: 'user' | 'agent' }) => void;
    addEmptyActNode: (position: { x: number; y: number }) => string;
    addQueryActNode: (position: { x: number; y: number }, initialLabel: string) => string;
    resetActNode: (nodeId: string, payload?: { label?: string; referencedNodeIds?: string[] }) => void;
    updateActNodeLabel: (nodeId: string, label: string) => void;
    appendActNodeContent: (nodeId: string, content: string) => void;
    appendActNodeThought: (nodeId: string, thought: string) => void;
    removeActNode: (nodeId: string) => void;
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

function uniqueIds(ids: string[]) {
    return [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0))];
}

function buildReferenceEdges(targetNodeId: string, referencedNodeIds: string[]): Edge[] {
    return uniqueIds(referencedNodeIds)
        .filter((sourceId) => sourceId !== targetNodeId)
        .map((sourceId) => ({
            id: `edge-ctx-${sourceId}-${targetNodeId}`,
            source: sourceId,
            target: targetNodeId,
            animated: true,
            style: { stroke: '#888', strokeDasharray: '5,5' },
        }));
}

function syncActReferenceEdges(actEdges: Edge[], targetNodeId: string, referencedNodeIds: string[]) {
    const preservedEdges = actEdges.filter((edge) => !(edge.target === targetNodeId && edge.id.startsWith('edge-ctx-')));
    return [
        ...preservedEdges,
        ...buildReferenceEdges(targetNodeId, referencedNodeIds),
    ];
}

let _nodeCounter = 0;

export const useGraphStore = create<GraphState>((set) => ({
    persistedNodes: [],
    persistedEdges: [],
    actNodes: [],
    actEdges: [],
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
    setActGraph: (nodes, edges) => set((state) => ({
        actNodes: preserveNodePositions(state.actNodes, nodes),
        actEdges: edges,
    })),
    clearActGraph: () => set((state) => {
        const actNodeIds = new Set(state.actNodes.map((node) => node.id));
        const activeNodeId = state.activeNodeId && actNodeIds.has(state.activeNodeId)
            ? null
            : state.activeNodeId;
        const editingNodeId = state.editingNodeId && actNodeIds.has(state.editingNodeId)
            ? null
            : state.editingNodeId;

        return {
            actNodes: [],
            actEdges: [],
            selectedNodeIds: state.selectedNodeIds.filter((id) => !actNodeIds.has(id)),
            expandedNodeIds: state.expandedNodeIds.filter((id) => !actNodeIds.has(id)),
            activeNodeId,
            editingNodeId,
            streamingNodeIds: state.streamingNodeIds.filter((id) => !actNodeIds.has(id)),
        };
    }),
    clearSelection: () => set({ selectedNodeIds: [] }),
    setActiveNode: (id: string | null) => set({ activeNodeId: id }),
    toggleExpandedNode: (id: string) => set((state) => ({
        expandedNodeIds: state.expandedNodeIds.includes(id)
            ? state.expandedNodeIds.filter((expandedId) => expandedId !== id)
            : [...state.expandedNodeIds, id],
    })),
    expandNode: (id: string) => set((state) => (
        state.expandedNodeIds.includes(id)
            ? state
            : { expandedNodeIds: [...state.expandedNodeIds, id] }
    )),
    toggleExpandedBranchNode: (id: string) => set((state) => ({
        expandedBranchNodeIds: state.expandedBranchNodeIds.includes(id)
            ? state.expandedBranchNodeIds.filter((expandedId) => expandedId !== id)
            : [...state.expandedBranchNodeIds, id],
    })),
    expandBranchNode: (id: string) => set((state) => (
        state.expandedBranchNodeIds.includes(id)
            ? state
            : { expandedBranchNodeIds: [...state.expandedBranchNodeIds, id] }
    )),
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

    addOrUpdateActNode: (nodeId, payload) => set((state) => {
        const exists = state.actNodes.find(n => n.id === nodeId);
        if (exists) {
            const nextReferencedNodeIds = payload.referencedNodeIds !== undefined
                ? payload.referencedNodeIds
                : (Array.isArray(exists.data?.referencedNodeIds)
                    ? exists.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
                    : []);
            return {
                actNodes: state.actNodes.map(n =>
                    n.id === nodeId
                        ? {
                            ...n,
                            data: {
                                ...n.data,
                                ...(payload.label !== undefined ? { label: payload.label } : {}),
                                ...(payload.kind !== undefined ? { kind: payload.kind } : {}),
                                ...(payload.referencedNodeIds !== undefined ? { referencedNodeIds: payload.referencedNodeIds } : {}),
                                ...(payload.createdBy !== undefined ? { createdBy: payload.createdBy } : {}),
                            },
                        }
                        : n
                ),
                actEdges: syncActReferenceEdges(state.actEdges, nodeId, nextReferencedNodeIds),
            };
        }

        const newNode: Node = {
            id: nodeId,
            type: 'customTask',
            position: { x: 200 + (state.actNodes.length * 10), y: 150 + (state.actNodes.length * 100) },
            data: {
                label: payload.label ?? '',
                nodeSource: 'act',
                createdBy: payload.createdBy ?? 'agent',
                kind: payload.kind ?? 'act',
                referencedNodeIds: payload.referencedNodeIds ?? [],
                contentMd: '',
            }
        };

        const newEdges = syncActReferenceEdges(state.actEdges, nodeId, payload.referencedNodeIds ?? []);
        const shouldLinkToFirstActNode = state.actNodes.length > 0
            && (payload.referencedNodeIds?.length ?? 0) === 0
            && state.selectedNodeIds.length === 0;

        const nextActEdges = shouldLinkToFirstActNode
            ? [
                ...newEdges,
                {
                    id: `e-${state.actNodes[0].id}-${nodeId}`,
                    source: state.actNodes[0].id,
                    target: nodeId,
                    animated: true,
                },
            ]
            : newEdges;

        return { actNodes: [...state.actNodes, newNode], actEdges: nextActEdges };
    }),

    addEmptyActNode: (position) => {
        const id = `user-node-${++_nodeCounter}-${Date.now()}`;
        set((state) => ({
            actNodes: [...state.actNodes, {
                id,
                type: 'customTask',
                position,
                data: { label: '', nodeSource: 'act', createdBy: 'user', kind: 'act', contentMd: '', isManualPosition: true }
            }],
            editingNodeId: id,
            activeNodeId: id,
            expandedNodeIds: state.expandedNodeIds.includes(id)
                ? state.expandedNodeIds
                : [...state.expandedNodeIds, id],
        }));
        return id;
    },

    addQueryActNode: (position, initialLabel) => {
        const id = `act-node-${++_nodeCounter}-${Date.now()}`;
        set((state) => ({
            actNodes: [...state.actNodes, {
                id,
                type: 'customTask',
                position,
                data: {
                    label: initialLabel,
                    nodeSource: 'act',
                    createdBy: 'user',
                    kind: 'act',
                    contentMd: '',
                    referencedNodeIds: [...state.selectedNodeIds],
                }
            }],
            actEdges: syncActReferenceEdges(state.actEdges, id, state.selectedNodeIds),
            editingNodeId: id,
            activeNodeId: id,
            expandedNodeIds: state.expandedNodeIds.includes(id)
                ? state.expandedNodeIds
                : [...state.expandedNodeIds, id],
        }));
        return id;
    },

    resetActNode: (nodeId, payload) => set((state) => {
        const existingNode = state.actNodes.find((node) => node.id === nodeId);
        const nextReferencedNodeIds = payload?.referencedNodeIds !== undefined
            ? payload.referencedNodeIds
            : (Array.isArray(existingNode?.data?.referencedNodeIds)
                ? existingNode.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
                : []);
        return {
            actNodes: state.actNodes.map((node) =>
                node.id === nodeId
                    ? {
                        ...node,
                        data: {
                            ...node.data,
                            ...(payload?.label !== undefined ? { label: payload.label } : {}),
                            ...(payload?.referencedNodeIds !== undefined ? { referencedNodeIds: payload.referencedNodeIds } : {}),
                            contentMd: '',
                            thoughtMd: '',
                            contextSummary: '',
                            detailHtml: '',
                        },
                    }
                    : node,
            ),
            actEdges: syncActReferenceEdges(state.actEdges, nodeId, nextReferencedNodeIds),
        };
    }),

    updateActNodeLabel: (nodeId, label) => set((state) => ({
        actNodes: state.actNodes.map(n =>
            n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
        ),
        editingNodeId: null,
    })),

    appendActNodeContent: (nodeId, content) => set((state) => ({
        actNodes: state.actNodes.map(n =>
            n.id === nodeId
                ? { ...n, data: { ...n.data, contentMd: (n.data.contentMd as string || '') + content } }
                : n
        )
    })),

    appendActNodeThought: (nodeId, thought) => set((state) => ({
        actNodes: state.actNodes.map(n =>
            n.id === nodeId
                ? { ...n, data: { ...n.data, thoughtMd: ((n.data.thoughtMd as string) || '') + thought } }
                : n
        )
    })),

    removeActNode: (nodeId) => set((state) => ({
        actNodes: state.actNodes.filter(n => n.id !== nodeId),
        actEdges: state.actEdges.filter(e => e.source !== nodeId && e.target !== nodeId),
        expandedNodeIds: state.expandedNodeIds.filter((id) => id !== nodeId),
        selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
        streamingNodeIds: state.streamingNodeIds.filter((id) => id !== nodeId),
        activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        editingNodeId: state.editingNodeId === nodeId ? null : state.editingNodeId,
    })),
}));

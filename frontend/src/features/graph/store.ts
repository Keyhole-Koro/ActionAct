import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';
import { readLocalStorage, writeLocalStorage } from '@/lib/storage';

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
    nodeLastUsedAt: Record<string, number>;
    pinnedExpandedNodeIds: string[];

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
    recordNodeUsed: (nodeId: string) => void;
    pinExpandedNode: (nodeId: string) => void;
    unpinExpandedNode: (nodeId: string) => void;
    collapseUnusedNodes: (nowMs: number, thresholdMs: number) => void;

    addOrUpdateActNode: (nodeId: string, payload: {
        label?: string;
        kind?: string;
        referencedNodeIds?: string[];
        createdBy?: 'user' | 'agent';
        usedContextNodeIds?: string[];
        usedSelectedNodeContexts?: Array<{
            nodeId: string;
            label?: string;
            kind?: string;
            contextSummary?: string;
            contentMd?: string;
            thoughtMd?: string;
            detailHtml?: string;
        }>;
        usedTools?: string[];
        usedSources?: Array<{ id: string; kind?: string; label?: string; uri?: string }>;
    }) => void;
    addEmptyActNode: (position: { x: number; y: number }) => string;
    addQueryActNode: (position: { x: number; y: number }, initialLabel: string) => string;
    resetActNode: (nodeId: string, payload?: { label?: string; referencedNodeIds?: string[] }) => void;
    updateActNodeLabel: (nodeId: string, label: string) => void;
    appendActNodeContent: (nodeId: string, content: string) => void;
    appendActNodeThought: (nodeId: string, thought: string) => void;
    removeActNode: (nodeId: string) => void;
}

const SELECTED_NODE_IDS_STORAGE_KEY = 'action.graph.selectedNodeIds';

function readStoredSelectedNodeIds(): string[] {
    const parsed = readLocalStorage<unknown>(SELECTED_NODE_IDS_STORAGE_KEY, []);
    return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
}

function writeStoredSelectedNodeIds(ids: string[]) {
    writeLocalStorage(SELECTED_NODE_IDS_STORAGE_KEY, uniqueIds(ids).sort());
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
    selectedNodeIds: readStoredSelectedNodeIds(),
    expandedNodeIds: [],
    expandedBranchNodeIds: [],
    activeNodeId: null,
    editingNodeId: null,
    isStreaming: false,
    streamingNodeIds: [],
    nodeLastUsedAt: {},
    pinnedExpandedNodeIds: [],

    setSelectedNodes: (ids) => set((state) => {
        const nextIds = uniqueIds(ids).sort();
        if (sameIds(state.selectedNodeIds, nextIds)) {
            return state;
        }
        writeStoredSelectedNodeIds(nextIds);
        return { selectedNodeIds: nextIds };
    }),
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
        const nextSelectedNodeIds = state.selectedNodeIds.filter((id) => !actNodeIds.has(id));
        if (!sameIds(state.selectedNodeIds, nextSelectedNodeIds)) {
            writeStoredSelectedNodeIds(nextSelectedNodeIds);
        }

        const nextNodeLastUsedAt = Object.fromEntries(
            Object.entries(state.nodeLastUsedAt).filter(([id]) => !actNodeIds.has(id)),
        );
        return {
            actNodes: [],
            actEdges: [],
            selectedNodeIds: nextSelectedNodeIds,
            expandedNodeIds: state.expandedNodeIds.filter((id) => !actNodeIds.has(id)),
            pinnedExpandedNodeIds: state.pinnedExpandedNodeIds.filter((id) => !actNodeIds.has(id)),
            nodeLastUsedAt: nextNodeLastUsedAt,
            activeNodeId,
            editingNodeId,
            streamingNodeIds: state.streamingNodeIds.filter((id) => !actNodeIds.has(id)),
        };
    }),
    clearSelection: () => set((state) => {
        if (state.selectedNodeIds.length === 0) {
            return state;
        }
        writeStoredSelectedNodeIds([]);
        return { selectedNodeIds: [] };
    }),
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
    recordNodeUsed: (nodeId) => set((state) => ({
        nodeLastUsedAt: { ...state.nodeLastUsedAt, [nodeId]: Date.now() },
    })),
    pinExpandedNode: (nodeId) => set((state) => (
        state.pinnedExpandedNodeIds.includes(nodeId)
            ? state
            : { pinnedExpandedNodeIds: [...state.pinnedExpandedNodeIds, nodeId] }
    )),
    unpinExpandedNode: (nodeId) => set((state) => ({
        pinnedExpandedNodeIds: state.pinnedExpandedNodeIds.filter((id) => id !== nodeId),
    })),
    collapseUnusedNodes: (nowMs, thresholdMs) => set((state) => {
        const pinnedSet = new Set(state.pinnedExpandedNodeIds);
        const streamingSet = new Set(state.streamingNodeIds);
        const selectedSet = new Set(state.selectedNodeIds);
        const referencedSet = new Set<string>();
        for (const node of [...state.actNodes, ...state.persistedNodes]) {
            const isActive =
                streamingSet.has(node.id) ||
                selectedSet.has(node.id) ||
                node.id === state.activeNodeId;
            if (isActive && Array.isArray(node.data?.referencedNodeIds)) {
                for (const refId of node.data.referencedNodeIds as unknown[]) {
                    if (typeof refId === 'string') referencedSet.add(refId);
                }
            }
        }
        const nextExpandedNodeIds = state.expandedNodeIds.filter((nodeId) => {
            if (pinnedSet.has(nodeId)) return true;
            if (streamingSet.has(nodeId)) return true;
            if (selectedSet.has(nodeId)) return true;
            if (nodeId === state.activeNodeId) return true;
            if (referencedSet.has(nodeId)) return true;
            const lastUsed = state.nodeLastUsedAt[nodeId];
            return lastUsed !== undefined && nowMs - lastUsed < thresholdMs;
        });
        if (nextExpandedNodeIds.length === state.expandedNodeIds.length) return state;
        return { expandedNodeIds: nextExpandedNodeIds };
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
                                ...(payload.usedContextNodeIds !== undefined ? { usedContextNodeIds: payload.usedContextNodeIds } : {}),
                                ...(payload.usedSelectedNodeContexts !== undefined ? { usedSelectedNodeContexts: payload.usedSelectedNodeContexts } : {}),
                                ...(payload.usedTools !== undefined ? { usedTools: payload.usedTools } : {}),
                                ...(payload.usedSources !== undefined ? { usedSources: payload.usedSources } : {}),
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
                ...(payload.usedContextNodeIds !== undefined ? { usedContextNodeIds: payload.usedContextNodeIds } : {}),
                ...(payload.usedSelectedNodeContexts !== undefined ? { usedSelectedNodeContexts: payload.usedSelectedNodeContexts } : {}),
                ...(payload.usedTools !== undefined ? { usedTools: payload.usedTools } : {}),
                ...(payload.usedSources !== undefined ? { usedSources: payload.usedSources } : {}),
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

    removeActNode: (nodeId) => set((state) => {
        const nextSelectedNodeIds = state.selectedNodeIds.filter((id) => id !== nodeId);
        if (!sameIds(state.selectedNodeIds, nextSelectedNodeIds)) {
            writeStoredSelectedNodeIds(nextSelectedNodeIds);
        }
        const { [nodeId]: _removed, ...nextNodeLastUsedAt } = state.nodeLastUsedAt;
        return {
            actNodes: state.actNodes.filter(n => n.id !== nodeId),
            actEdges: state.actEdges.filter(e => e.source !== nodeId && e.target !== nodeId),
            expandedNodeIds: state.expandedNodeIds.filter((id) => id !== nodeId),
            pinnedExpandedNodeIds: state.pinnedExpandedNodeIds.filter((id) => id !== nodeId),
            nodeLastUsedAt: nextNodeLastUsedAt,
            selectedNodeIds: nextSelectedNodeIds,
            streamingNodeIds: state.streamingNodeIds.filter((id) => id !== nodeId),
            activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
            editingNodeId: state.editingNodeId === nodeId ? null : state.editingNodeId,
        };
    }),
}));

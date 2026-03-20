import { useEffect, useRef } from 'react';
import { Edge, Node } from '@xyflow/react';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';
import { useGraphStore } from '@/features/graph/store';
import type { GraphNodeBase, PersistedNodeData } from '../types';

interface UseGraphSubscriptionsOptions {
    effectiveWorkspaceId: string | undefined | null;
    setPersistedGraph: (nodes: Node<PersistedNodeData>[], edges: Edge[]) => void;
    setActGraph: (nodes: GraphNodeBase[], edges: Edge[]) => void;
}

export function useGraphSubscriptions({
    effectiveWorkspaceId,
    setPersistedGraph,
    setActGraph,
}: UseGraphSubscriptionsOptions) {
    const setPersistedGraphRef = useRef(setPersistedGraph);
    const persistedNodeCountRef = useRef(0);

    useEffect(() => {
        setPersistedGraphRef.current = setPersistedGraph;
    }, [setPersistedGraph]);

    useEffect(() => {
        if (!effectiveWorkspaceId) {
            persistedNodeCountRef.current = 0;
            setPersistedGraphRef.current([], []);
            return;
        }

        const unsubscribe = organizeService.subscribeTree(effectiveWorkspaceId, (topicNodes) => {
            const nextPersistedNodes: Node<PersistedNodeData>[] = topicNodes.map((node, index) => ({
                id: node.id,
                type: 'customTask',
                position: { x: 120, y: index * 180 + 80 },
                data: {
                    nodeSource: 'persisted',
                    createdBy: node.createdBy,
                    topicId: node.topicId,
                    inputId: node.inputId,
                    label: node.title,
                    kind: node.kind,
                    contextSummary: node.contextSummary,
                    detailHtml: node.detailHtml,
                    contentMd: node.contentMd,
                    evidenceRefs: node.evidenceRefs,
                    parentId: node.parentId,
                    referencedNodeIds: node.referencedNodeIds,
                },
            }));

            const nextPersistedEdges: Edge[] = topicNodes
                .filter((node) => node.parentId)
                .map((node) => ({
                    id: `e-${node.parentId}-${node.id}`,
                    source: node.parentId!,
                    target: node.id,
                    animated: true,
                }));

            if (nextPersistedNodes.length === 0 && persistedNodeCountRef.current > 0) {
                return;
            }
            persistedNodeCountRef.current = nextPersistedNodes.length;
            setPersistedGraphRef.current(nextPersistedNodes, nextPersistedEdges);
        });

        return () => unsubscribe();
    }, [effectiveWorkspaceId]);

    useEffect(() => {
        if (!effectiveWorkspaceId) {
            setActGraph([], []);
            return;
        }

        const unsubscribe = actDraftService.subscribeDrafts(effectiveWorkspaceId, (draftNodes) => {
            const graphState = useGraphStore.getState();
            const existingActNodeById = new Map(graphState.actNodes.map((node) => [node.id, node]));
            const draftActNodes: GraphNodeBase[] = draftNodes.map((node, index) => ({
                id: node.id,
                type: 'customTask',
                position: {
                    x: typeof node.positionX === 'number' ? node.positionX : 420,
                    y: typeof node.positionY === 'number' ? node.positionY : (index * 180 + 120),
                },
                data: {
                    nodeSource: 'act',
                    createdBy: node.createdBy ?? 'agent',
                    ...(node.authorUid !== undefined ? { authorUid: node.authorUid } : {}),
                    topicId: node.topicId,
                    label: graphState.editingNodeId === node.id
                        ? (typeof existingActNodeById.get(node.id)?.data?.label === 'string'
                            ? existingActNodeById.get(node.id)?.data?.label as string
                            : node.title)
                        : node.title,
                    kind: 'act',
                    contentMd: node.contentMd,
                    thoughtMd: node.thoughtMd,
                    contextSummary: node.contextSummary,
                    detailHtml: node.detailHtml,
                    referencedNodeIds: node.referencedNodeIds,
                    parentId: node.parentId,
                    ...(node.isManualPosition ? { isManualPosition: true } : {}),
                },
            }));
            const draftNodeIds = new Set(draftActNodes.map((node) => node.id));

            // Nodes that were pending (streamed but not yet in Firestore) and now appear
            // in the draft snapshot have been confirmed — remove them from pending.
            const nowConfirmedIds = graphState.pendingNodeIds.filter((id) => draftNodeIds.has(id));
            if (nowConfirmedIds.length > 0) {
                useGraphStore.getState().removePendingNodes(nowConfirmedIds);
            }

            const preservedLiveNodes = graphState.actNodes.filter((node) => {
                if (draftNodeIds.has(node.id)) {
                    return false;
                }
                return graphState.streamingNodeIds.includes(node.id)
                    || graphState.editingNodeId === node.id
                    || graphState.pendingNodeIds.includes(node.id);
            });
            const nextActNodes = [...draftActNodes, ...preservedLiveNodes];
            const nextActEdges: Edge[] = nextActNodes.flatMap((node) => {
                const referencedNodeIds = Array.isArray(node.data?.referencedNodeIds)
                    ? node.data.referencedNodeIds.filter((value): value is string => typeof value === 'string' && value !== node.id)
                    : [];
                return referencedNodeIds.map((sourceId) => ({
                    id: `edge-ctx-${sourceId}-${node.id}`,
                    source: sourceId,
                    target: node.id,
                    animated: true,
                    style: { stroke: '#888', strokeDasharray: '5,5' },
                }));
            });
            setActGraph(nextActNodes as unknown as GraphNodeBase[], nextActEdges);
        });

        return () => unsubscribe();
    }, [effectiveWorkspaceId, setActGraph]);
}

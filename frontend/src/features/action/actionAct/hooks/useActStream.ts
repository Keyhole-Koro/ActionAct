import { useState, useCallback } from 'react';

import { actService } from '@/services/act';
import { PatchOp, StreamActOptions } from '@/services/act/port';
import { actDraftService } from '@/services/actDraft/firestore';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useGraphStore } from '@/features/graph/store';

function normalizePatchNodeId(nodeId: string, targetNodeId: string | null) {
    if (nodeId === 'root' && targetNodeId) {
        return targetNodeId;
    }
    return nodeId;
}

export function useActStream() {
    const [isStreaming, setIsStreaming] = useState(false);
    const { addOrUpdateNode, appendContent } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();

    const startStream = useCallback((targetNodeId: string | null, query: string, options?: StreamActOptions & { clear?: boolean }) => {
        setIsStreaming(true);
        const { selectedNodeIds } = useGraphStore.getState();
        const touchedNodeIds = new Set<string>();
        const persistTouchedNodes = async () => {
            const { nodes } = useGraphStore.getState();
            const nodesById = new Map(nodes.map((node) => [node.id, node]));
            await Promise.all(
                [...touchedNodeIds].map(async (nodeId) => {
                    const node = nodesById.get(nodeId);
                    if (!node) {
                        return;
                    }
                    await actDraftService.saveDraftSnapshot(workspaceId, topicId, nodeId, {
                        title: typeof node.data?.label === 'string' ? node.data.label : query,
                        kind: typeof node.data?.kind === 'string' ? node.data.kind : 'act',
                        contentMd: typeof node.data?.contentMd === 'string' ? node.data.contentMd : '',
                    });
                }),
            );
        };

        const cancel = actService.streamAct(
            query,
            (patch: PatchOp) => {
                const normalizedNodeId = normalizePatchNodeId(patch.nodeId, targetNodeId);
                touchedNodeIds.add(normalizedNodeId);

                if (patch.type === 'upsert' && patch.data) {
                    const existingNode = useGraphStore.getState().nodes.find((node) => node.id === normalizedNodeId);
                    addOrUpdateNode(normalizedNodeId, {
                        label: patch.data.label ?? (
                            existingNode
                                ? undefined
                                : targetNodeId === null
                                    ? query
                                    : undefined
                        ),
                        kind: patch.data.kind ?? 'act',
                    });
                } else if (patch.type === 'append_md' && patch.data?.contentMd) {
                    appendContent(normalizedNodeId, patch.data.contentMd);
                }
            },

            async () => {
                await persistTouchedNodes();
                setIsStreaming(false);
            },
            (error) => {
                void persistTouchedNodes();
                console.error("Stream error:", error);
                setIsStreaming(false);
            },
            {
                ...options,
                anchorNodeId: targetNodeId ?? options?.anchorNodeId,
                contextNodeIds: options?.contextNodeIds ?? selectedNodeIds,
            },
        );

        return cancel;
    }, [addOrUpdateNode, appendContent, topicId, workspaceId]);

    return { isStreaming, startStream };
}

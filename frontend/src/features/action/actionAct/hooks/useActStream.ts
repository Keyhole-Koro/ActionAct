import { useState, useCallback } from 'react';

import { actService } from '@/services/act';
import { PatchOp, StreamActOptions } from '@/services/act/port';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';
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
                    const persistedNode = {
                        id: nodeId,
                        title: typeof node.data?.label === 'string' ? node.data.label : query,
                        type: typeof node.data?.type === 'string' ? node.data.type : 'act',
                        contentMd: typeof node.data?.contentMd === 'string' ? node.data.contentMd : '',
                    };

                    await organizeService.upsertNode(workspaceId, topicId, persistedNode);
                    await actDraftService.saveDraftSnapshot(workspaceId, topicId, nodeId, {
                        title: persistedNode.title,
                        kind: persistedNode.type,
                        contentMd: persistedNode.contentMd,
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
                    addOrUpdateNode(normalizedNodeId, patch.data.label || 'Unknown', patch.data.type || 'unknown');
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
            options,
        );

        return cancel;
    }, [addOrUpdateNode, appendContent, topicId, workspaceId]);

    return { isStreaming, startStream };
}

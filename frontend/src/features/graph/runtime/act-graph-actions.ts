"use client";

import { actDraftService } from '@/services/actDraft/firestore';
import { useGraphStore } from '@/features/graph/store';
import { removeGraphCache } from '@/features/graph/hooks/useGraphCache';

export async function removeActNodeAndDraft(workspaceId: string, topicId: string, nodeId: string) {
    useGraphStore.getState().removeActNode(nodeId);
    await actDraftService.deleteDraft(workspaceId, topicId, nodeId).catch((error) => {
        console.error('Failed to delete act draft', { nodeId, error });
    });
}

export async function clearAllActNodes(workspaceId: string, topicId: string) {
    const nodeIds = useGraphStore.getState().actNodes.map((node) => node.id);
    useGraphStore.getState().clearActGraph();
    removeGraphCache('act', workspaceId);

    await Promise.all(
        nodeIds.map((nodeId) => actDraftService.deleteDraft(workspaceId, topicId, nodeId).catch((error) => {
            console.error('Failed to delete act draft', { nodeId, error });
        })),
    );
}

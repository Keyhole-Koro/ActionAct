"use client";

import { actDraftService } from '@/services/actDraft/firestore';
import { useGraphStore } from '@/features/graph/store';

export async function upsertActNodeDraft(
    workspaceId: string,
    nodeId: string,
    payload: {
        label?: string;
        kind?: string;
        status?: 'running' | 'completed' | 'failed';
        agentRole?: 'search';
        parentId?: string;
        referencedNodeIds?: string[];
        createdBy?: 'user' | 'agent';
        authorUid?: string;
        contentMd?: string;
        thoughtMd?: string;
    },
) {
    // 1. Update local store first for responsiveness
    useGraphStore.getState().addOrUpdateActNode(nodeId, payload);

    // 2. Persist to Firestore
    const node = useGraphStore.getState().actNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const isUserActRoot = node.data?.nodeSource === 'act'
        && node.data?.createdBy === 'user'
        && typeof node.data?.parentId !== 'string';

    await actDraftService.saveDraftSnapshot(workspaceId, nodeId, {
        title: payload.label ?? (node.data?.label as string),
        kind: payload.kind ?? (node.data?.kind as string),
        status: payload.status ?? (node.data?.status as 'running' | 'completed' | 'failed' | undefined),
        agentRole: payload.agentRole ?? (node.data?.agentRole as 'search' | undefined),
        createdBy: payload.createdBy ?? (node.data?.createdBy as 'user' | 'agent'),
        authorUid: payload.authorUid ?? (node.data?.authorUid as string),
        contentMd: payload.contentMd ?? (node.data?.contentMd as string),
        thoughtMd: payload.thoughtMd ?? (node.data?.thoughtMd as string),
        referencedNodeIds: payload.referencedNodeIds ?? (node.data?.referencedNodeIds as string[]),
        parentId: payload.parentId ?? (node.data?.parentId as string),
        ...(isUserActRoot ? {
            isManualPosition: node.data?.isManualPosition === true,
            positionX: node.position?.x,
            positionY: node.position?.y,
        } : {}),
    }).catch((error) => {
        console.error('Failed to save act draft', { nodeId, error });
    });
}

export async function removeActNodeAndDraft(workspaceId: string, nodeId: string) {
    useGraphStore.getState().removeActNode(nodeId);
    await actDraftService.deleteDraft(workspaceId, nodeId).catch((error) => {
        console.error('Failed to delete act draft', { nodeId, error });
    });
}

export async function clearAllActNodes(workspaceId: string) {
    const nodeIds = useGraphStore.getState().actNodes.map((node) => node.id);
    useGraphStore.getState().clearActGraph();

    await Promise.all(
        nodeIds.map((nodeId) => actDraftService.deleteDraft(workspaceId, nodeId).catch((error) => {
            console.error('Failed to delete act draft', { nodeId, error });
        })),
    );
}

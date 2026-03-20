"use client";

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';

import { useUploadStore } from '@/features/action/actionOrganize/store/useUploadStore';
import { useGraphStore } from '@/features/graph/store';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { createDirectFrontendToolClient } from '@/features/agentTools/runtime/frontend-tool-client';
import { prepareAnchoredActRun } from '@/features/agentTools/runtime/frontend-tool-orchestrator';
import { useActClarificationStore } from '@/features/agentTools/store/act-clarification-store';
import { clearAllActNodes, removeActNodeAndDraft } from '@/features/graph/runtime/act-graph-actions';
import { actDraftService } from '@/services/actDraft/firestore';
import { organizeService } from '@/services/organize';

type Params = {
    workspaceId: string;
};

export function useGraphCommands({ workspaceId }: Params) {
    const {
        actNodes,
        setActiveNode,
        setSelectedNodes,
        toggleExpandedBranchNode,
        expandBranchNode,
        updateActNodeLabel,
        setEditingNode,
        expandNode,
        recordNodeUsed,
    } = useGraphStore();
    const setPendingClarification = useActClarificationStore((state) => state.setPendingClarification);

    const frontendToolClient = useMemo(() => createDirectFrontendToolClient(), []);

    const openDetails = useCallback((nodeId: string) => {
        setActiveNode(nodeId);
        expandNode(nodeId);
        recordNodeUsed(nodeId);
    }, [expandNode, recordNodeUsed, setActiveNode]);

    const openReferencedNode = useCallback((nodeId: string) => {
        openDetails(nodeId);
    }, [openDetails]);

    const runActFromNode = useCallback(async (nodeId: string, query: string) => {
        setSelectedNodes([nodeId]);
        recordNodeUsed(nodeId);
        const prepared = await prepareAnchoredActRun(frontendToolClient, {
            anchorNodeId: nodeId,
            userMessage: query,
            explicitContextNodeIds: [nodeId],
        });
        if (prepared.status !== 'ready') {
            await setPendingClarification({
                clarification: prepared.clarification,
                pendingRun: {
                    targetNodeId: nodeId,
                    query,
                    options: { clear: false },
                },
            });
            return;
        }
        const { frontendNodeId } = startActRun({ targetNodeId: nodeId, query, options: { clear: false, contextNodeIds: prepared.contextNodeIds } });
        setActiveNode(frontendNodeId);
        expandNode(frontendNodeId);
        recordNodeUsed(frontendNodeId);
    }, [expandNode, frontendToolClient, recordNodeUsed, setActiveNode, setPendingClarification, setSelectedNodes]);

    const persistActNodeLabel = useCallback(async (nodeId: string, rawLabel: string) => {
        const nextLabel = rawLabel.trim();
        updateActNodeLabel(nodeId, nextLabel);
        setEditingNode(null);
        if (!workspaceId) {
            return;
        }
        try {
            await actDraftService.patchDraft(workspaceId, nodeId, {
                title: nextLabel,
            });
        } catch (error) {
            console.error('Failed to persist act draft label', { nodeId, error });
        }
    }, [setEditingNode, updateActNodeLabel, workspaceId]);

    const commitActNodeLabel = useCallback(async (nodeId: string, rawLabel: string) => {
        const trimmed = rawLabel.trim();
        const existingNode = actNodes.find((node) => node.id === nodeId);
        const hasResolvedContent = [
            existingNode?.data?.contentMd,
            existingNode?.data?.contextSummary,
            existingNode?.data?.detailHtml,
        ].some((value) => typeof value === 'string' && value.trim().length > 0);
        const referencedNodeIds = Array.isArray(existingNode?.data?.referencedNodeIds)
            ? existingNode.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
            : [];

        if (!trimmed) {
            await removeActNodeAndDraft(workspaceId, nodeId);
            return;
        }

        await persistActNodeLabel(nodeId, trimmed);
        if (!hasResolvedContent) {
            setSelectedNodes([nodeId]);
            const prepared = await prepareAnchoredActRun(frontendToolClient, {
                anchorNodeId: nodeId,
                userMessage: trimmed,
                explicitContextNodeIds: referencedNodeIds,
            });
            if (prepared.status !== 'ready') {
                await setPendingClarification({
                    clarification: prepared.clarification,
                    pendingRun: {
                        targetNodeId: nodeId,
                        query: trimmed,
                        options: { clear: false },
                    },
                });
                return;
            }
            startActRun({
                targetNodeId: nodeId,
                query: trimmed,
                options: { clear: false, contextNodeIds: prepared.contextNodeIds },
            });
        }
    }, [actNodes, frontendToolClient, persistActNodeLabel, setPendingClarification, setSelectedNodes, workspaceId]);

    const clearAct = useCallback(async () => {
        await clearAllActNodes(workspaceId);
    }, [workspaceId]);

    const addMediaContext = useCallback(async (_nodeId: string, file: File) => {
        const result = await organizeService.uploadInput(workspaceId, file);
        useUploadStore.getState().addUpload(workspaceId, result.topicId, result.inputId, file.name);
        toast.success('Media added to workspace context');
    }, [workspaceId]);

    return {
        openDetails,
        openReferencedNode,
        toggleBranch: toggleExpandedBranchNode,
        expandBranch: expandBranchNode,
        runActFromNode,
        commitActNodeLabel,
        persistActNodeLabel,
        updateActNodeLabel,
        addMediaContext,
        clearAct,
    };
}

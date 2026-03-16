"use client";

import { useCallback } from 'react';
import { toast } from 'sonner';

import { useUploadStore } from '@/features/action/actionOrganize/store/useUploadStore';
import { useGraphStore } from '@/features/graph/store';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { createDirectFrontendToolClient } from '@/features/agentTools/runtime/frontend-tool-client';
import { prepareAnchoredActRun } from '@/features/agentTools/runtime/frontend-tool-orchestrator';
import { useActClarificationStore } from '@/features/agentTools/store/act-clarification-store';
import { clearAllActNodes, removeActNodeAndDraft } from '@/features/graph/runtime/act-graph-actions';
import { organizeService } from '@/services/organize';

type Params = {
    workspaceId: string;
    topicId: string;
};

export function useGraphCommands({ workspaceId, topicId }: Params) {
    const {
        actNodes,
        setActiveNode,
        setSelectedNodes,
        toggleExpandedBranchNode,
        updateActNodeLabel,
        expandNode,
    } = useGraphStore();
    const setPendingClarification = useActClarificationStore((state) => state.setPendingClarification);

    const frontendToolClient = createDirectFrontendToolClient();

    const openDetails = useCallback((nodeId: string) => {
        setActiveNode(nodeId);
        expandNode(nodeId);
    }, [expandNode, setActiveNode]);

    const openReferencedNode = useCallback((nodeId: string) => {
        openDetails(nodeId);
    }, [openDetails]);

    const runActFromNode = useCallback(async (nodeId: string, query: string) => {
        setSelectedNodes([nodeId]);
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
        startActRun({ targetNodeId: nodeId, query, options: { clear: false, contextNodeIds: prepared.contextNodeIds } });
    }, [setPendingClarification, setSelectedNodes]);

    const commitActNodeLabel = useCallback(async (nodeId: string, rawLabel: string) => {
        const trimmed = rawLabel.trim();
        const existingNode = actNodes.find((node) => node.id === nodeId);
        const previousLabel = typeof existingNode?.data?.label === 'string' ? existingNode.data.label : '';
        const hasResolvedContent = [
            existingNode?.data?.contentMd,
            existingNode?.data?.contextSummary,
            existingNode?.data?.detailHtml,
        ].some((value) => typeof value === 'string' && value.trim().length > 0);
        const referencedNodeIds = Array.isArray(existingNode?.data?.referencedNodeIds)
            ? existingNode.data.referencedNodeIds.filter((value): value is string => typeof value === 'string')
            : [];

        if (!trimmed) {
            await removeActNodeAndDraft(workspaceId, topicId, nodeId);
            return;
        }

        updateActNodeLabel(nodeId, trimmed);
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
    }, [actNodes, setPendingClarification, setSelectedNodes, topicId, updateActNodeLabel, workspaceId]);

    const clearAct = useCallback(async () => {
        await clearAllActNodes(workspaceId, topicId);
    }, [topicId, workspaceId]);

    const addMediaContext = useCallback(async (_nodeId: string, file: File) => {
        const result = await organizeService.uploadInput(workspaceId, file);
        useUploadStore.getState().addUpload(workspaceId, result.topicId, result.inputId, file.name);
        toast.success('Media added to workspace context');
    }, [workspaceId]);

    return {
        openDetails,
        openReferencedNode,
        toggleBranch: toggleExpandedBranchNode,
        runActFromNode,
        commitActNodeLabel,
        addMediaContext,
        clearAct,
    };
}

"use client";

import { useCallback } from 'react';

import { useGraphStore } from '@/features/graph/store';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { prepareAnchoredActRun } from '@/features/agentTools/runtime/frontend-tool-orchestrator';
import { frontendToolServer } from '@/features/agentTools/runtime/frontend-tool-registry';
import { useActClarificationStore } from '@/features/agentTools/store/act-clarification-store';
import { clearAllActNodes, removeActNodeAndDraft } from '@/features/graph/runtime/act-graph-actions';

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

    const frontendToolClient = {
        available: () => true,
        listTools: () => frontendToolServer.listTools(),
        invokeTool: (name: string, input: unknown) => frontendToolServer.invokeTool(name, input),
    };

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
            setPendingClarification({
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

        if (!trimmed) {
            await removeActNodeAndDraft(workspaceId, topicId, nodeId);
            return;
        }

        updateActNodeLabel(nodeId, trimmed);
        if (!previousLabel) {
            setSelectedNodes([nodeId]);
            const prepared = await prepareAnchoredActRun(frontendToolClient, {
                anchorNodeId: nodeId,
                userMessage: trimmed,
                explicitContextNodeIds: [nodeId],
            });
            if (prepared.status !== 'ready') {
                setPendingClarification({
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

    return {
        openDetails,
        openReferencedNode,
        toggleBranch: toggleExpandedBranchNode,
        runActFromNode,
        commitActNodeLabel,
        clearAct,
    };
}

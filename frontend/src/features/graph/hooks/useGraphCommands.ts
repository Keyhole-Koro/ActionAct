"use client";

import { useCallback } from 'react';

import { usePanelStore } from '@/features/layout/store/panel-store';
import { useGraphStore } from '@/features/graph/store';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { clearAllActNodes, removeActNodeAndDraft } from '@/features/graph/runtime/act-graph-actions';

type Params = {
    workspaceId: string;
    topicId: string;
};

export function useGraphCommands({ workspaceId, topicId }: Params) {
    const { openPanel } = usePanelStore();
    const {
        actNodes,
        setActiveNode,
        setSelectedNodes,
        toggleExpandedBranchNode,
        updateActNodeLabel,
    } = useGraphStore();

    const openDetails = useCallback((nodeId: string) => {
        setActiveNode(nodeId);
        openPanel('node-detail', nodeId);
    }, [openPanel, setActiveNode]);

    const openReferencedNode = useCallback((nodeId: string) => {
        openDetails(nodeId);
    }, [openDetails]);

    const runActFromNode = useCallback((nodeId: string, query: string) => {
        setSelectedNodes([nodeId]);
        startActRun({ targetNodeId: nodeId, query, options: { clear: false } });
    }, [setSelectedNodes]);

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
            startActRun({ targetNodeId: nodeId, query: trimmed, options: { clear: false } });
        }
    }, [actNodes, setSelectedNodes, topicId, updateActNodeLabel, workspaceId]);

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

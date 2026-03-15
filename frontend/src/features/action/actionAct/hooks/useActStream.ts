import { useCallback, useMemo } from 'react';

import { StreamActOptions } from '@/services/act/port';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { prepareSubmitAskRun } from '@/features/agentTools/runtime/frontend-tool-orchestrator';
import { frontendToolServer } from '@/features/agentTools/runtime/frontend-tool-registry';
import { useActClarificationStore } from '@/features/agentTools/store/act-clarification-store';
import { useGraphStore } from '@/features/graph/store';

export function useActStream() {
    const isStreaming = useGraphStore((state) => state.isStreaming);
    const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
    const clarification = useActClarificationStore((state) => state.clarification);
    const setPendingClarification = useActClarificationStore((state) => state.setPendingClarification);
    const clearClarification = useActClarificationStore((state) => state.clearClarification);
    const continueWithoutContext = useActClarificationStore((state) => state.continueWithoutContext);
    const retryWithSelection = useActClarificationStore((state) => state.retryWithSelection);

    const frontendToolClient = useMemo(() => ({
        available: () => true,
        listTools: () => frontendToolServer.listTools(),
        invokeTool: (name: string, input: unknown) => frontendToolServer.invokeTool(name, input),
    }), []);

    const startStream = useCallback(async (targetNodeId: string | null, query: string, options?: StreamActOptions & { clear?: boolean }) => {
        if (targetNodeId) {
            clearClarification();
            const { cancel } = startActRun({ targetNodeId, query, options });
            return cancel;
        }

        const prepared = await prepareSubmitAskRun(frontendToolClient, {
            userMessage: query,
            explicitContextNodeIds: options?.contextNodeIds,
        });
        if (prepared.status !== 'ready') {
            await setPendingClarification({
                clarification: prepared.clarification,
                pendingRun: {
                    targetNodeId: null,
                    query,
                    options,
                },
            });
            return () => undefined;
        }

        clearClarification();
        const { cancel } = startActRun({
            targetNodeId,
            query,
            options: {
                ...options,
                contextNodeIds: prepared.contextNodeIds,
            },
        });
        return cancel;
    }, [clearClarification, frontendToolClient, setPendingClarification]);

    return {
        isStreaming,
        startStream,
        clarification,
        hasSelectedNodes: selectedNodeIds.length > 0,
        clearClarification,
        continueWithoutContext,
        retryWithSelection,
    };
}

import { useCallback, useMemo } from 'react';

import { StreamActOptions } from '@/services/act/port';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { createDirectFrontendToolClient } from '@/features/agentTools/runtime/frontend-tool-client';
import { prepareSubmitAskRun } from '@/features/agentTools/runtime/frontend-tool-orchestrator';
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

    const frontendToolClient = useMemo(() => createDirectFrontendToolClient(), []);

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
        hasSelectedNodes: selectedNodeIds.length > 0 || Boolean(clarification?.candidate_options?.length),
        clearClarification,
        continueWithoutContext,
        retryWithSelection,
    };
}

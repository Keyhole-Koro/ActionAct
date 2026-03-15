import { useCallback } from 'react';

import { StreamActOptions } from '@/services/act/port';
import { startActRun } from '@/features/agentTools/runtime/act-runner';
import { useGraphStore } from '@/features/graph/store';

export function useActStream() {
    const isStreaming = useGraphStore((state) => state.isStreaming);

    const startStream = useCallback((targetNodeId: string | null, query: string, options?: StreamActOptions & { clear?: boolean }) => {
        const { cancel } = startActRun({ targetNodeId, query, options });
        return cancel;
    }, []);

    return { isStreaming, startStream };
}

import { useState, useCallback } from 'react';
import { actService } from '@/services/act';
import { useGraphStore } from '@/features/graph/store';
import { PatchOp, StreamActOptions } from '@/services/act/port';

export function useActStream() {
    const [isStreaming, setIsStreaming] = useState(false);
    const { addOrUpdateNode, appendContent } = useGraphStore();

    const startStream = useCallback((query: string, options?: StreamActOptions & { clear?: boolean }) => {
        setIsStreaming(true);
        // Never clear existing nodes — always append new ones

        const cancel = actService.streamAct(
            query,
            (patch: PatchOp) => {
                if (patch.type === 'upsert' && patch.data) {
                    addOrUpdateNode(patch.nodeId, patch.data.label || 'Unknown', patch.data.type || 'unknown');
                } else if (patch.type === 'append_md' && patch.data?.contentMd) {
                    appendContent(patch.nodeId, patch.data.contentMd);
                }
            },
            () => {
                setIsStreaming(false);
            },
            (error) => {
                console.error("Stream error:", error);
                setIsStreaming(false);
            },
            options,
        );

        return cancel;
    }, [addOrUpdateNode, appendContent]);

    return { isStreaming, startStream };
}

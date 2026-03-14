import { useState, useCallback } from 'react';
import { actService } from '@/services/act';
import { useKnowledgeTreeStore } from '@/features/knowledgeTree/store';
import { PatchOp } from '@/services/act/port';

export function useActStream() {
    const [isStreaming, setIsStreaming] = useState(false);
    const { addOrUpdateNode, appendContent, clearNodes } = useKnowledgeTreeStore();

    const startStream = useCallback((query: string, options?: { clear?: boolean }) => {
        setIsStreaming(true);
        if (options?.clear !== false) {
            clearNodes(); // For demo purposes, clear before new query
        }

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
            }
        );

        return cancel;
    }, [addOrUpdateNode, appendContent, clearNodes]);

    return { isStreaming, startStream };
}

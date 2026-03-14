import { useState, useCallback } from 'react';

import { actService } from '@/services/act';
import { PatchOp, StreamActOptions } from '@/services/act/port';
import { actDraftService } from '@/services/actDraft/firestore';
import { useRunContextStore } from '@/features/context/store/run-context-store';
import { useGraphStore } from '@/features/graph/store';

export function useActStream() {
    const [isStreaming, setIsStreaming] = useState(false);
    const { addOrUpdateNode, appendContent } = useGraphStore();
    const { workspaceId, topicId } = useRunContextStore();

    const startStream = useCallback((targetNodeId: string | null, query: string, options?: StreamActOptions & { clear?: boolean }) => {
        setIsStreaming(true);

        const cancel = actService.streamAct(
            query,
            (patch: PatchOp) => {
                if (patch.type === 'upsert' && patch.data) {
                    addOrUpdateNode(patch.nodeId, patch.data.label || 'Unknown', patch.data.type || 'unknown');
                } else if (patch.type === 'append_md' && patch.data?.contentMd) {
                    const idToUpdate = (patch.nodeId === 'root' && targetNodeId) ? targetNodeId : patch.nodeId;
                    appendContent(idToUpdate, patch.data.contentMd);
                }

                void actDraftService.applyPatch(workspaceId, topicId, patch, query);
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
    }, [addOrUpdateNode, appendContent, topicId, workspaceId]);

    return { isStreaming, startStream };
}

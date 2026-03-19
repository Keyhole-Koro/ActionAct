import { SelectionMode, UiSelectionOption } from '../types';

async function invokeOrThrow(name: string, input: Record<string, unknown>) {
    const { frontendToolServer } = await import('@/features/agentTools/runtime/frontend-tool-registry');
    const result = await frontendToolServer.invokeTool(name, input);
    if (!result.ok) {
        throw new Error(result.error.message);
    }
    return result.output;
}

export const agentTools = {
    async createSelectableNodes(params: {
        title: string;
        instruction: string;
        selection_mode?: SelectionMode;
        options: Omit<UiSelectionOption, 'selected'>[];
        anchor_node_id?: string | null;
        expires_in_ms?: number | null;
    }) {
        return invokeOrThrow('create_selectable_nodes', params);
    },

    async getSelectionGroupResult(groupId: string) {
        return invokeOrThrow('get_selection_group_result', { selection_group_id: groupId });
    },

    async reportStreamError(params: {
        source: 'terminal_error' | 'stream_exception' | 'unexpected_event' | 'reducer_failure';
        request_id?: string | null;
        trace_id?: string | null;
        stage?: string | null;
        retryable?: boolean | null;
        message: string;
        raw_event?: unknown | null;
    }) {
        return invokeOrThrow('report_stream_error', params as Record<string, unknown>);
    }
};

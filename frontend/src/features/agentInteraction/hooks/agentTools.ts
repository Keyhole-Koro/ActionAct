import { useAgentInteractionStore } from '../store/interactionStore';
import { SelectionMode, UiSelectionOption } from '../types';
import { toast } from 'sonner';

export const agentTools = {
    createSelectableNodes(params: {
        title: string;
        instruction: string;
        selection_mode?: SelectionMode;
        options: Omit<UiSelectionOption, 'selected'>[];
        anchor_node_id?: string | null;
        expires_in_ms?: number | null;
    }) {
        const groupId = `sg-${Date.now()}`;

        useAgentInteractionStore.getState().createGroup({
            selection_group_id: groupId,
            title: params.title,
            instruction: params.instruction,
            selection_mode: params.selection_mode || 'single',
            anchor_node_id: params.anchor_node_id,
            expires_in_ms: params.expires_in_ms,
            options: params.options.map(opt => ({ ...opt, selected: false }))
        });

        return {
            selection_group_id: groupId,
            created_node_ids: params.options.map(opt => opt.option_id),
            selection_mode: params.selection_mode || 'single',
            pending_user_selection: true
        };
    },

    getSelectionGroupResult(groupId: string) {
        const state = useAgentInteractionStore.getState();
        const group = state.groups[groupId];

        if (!group) {
            return { error: 'NOT_FOUND', status: 'unknown' };
        }

        return {
            selection_group_id: groupId,
            status: group.status,
            selected_option_ids: group.options.filter(o => o.selected).map(o => o.option_id),
            selected_node_ids: group.options.filter(o => o.selected).map(o => o.option_id) // simplified mapping for demo
        };
    },

    reportStreamError(params: {
        source: 'terminal_error' | 'stream_exception' | 'unexpected_event' | 'reducer_failure';
        request_id?: string | null;
        trace_id?: string | null;
        stage?: string | null;
        retryable?: boolean | null;
        message: string;
        raw_event?: unknown | null;
    }) {
        // Dev console: verbose
        console.error(`[AgentTool: Error] Source: ${params.source}`, {
            message: params.message,
            stage: params.stage,
            retryable: params.retryable,
            traceId: params.trace_id,
            requestId: params.request_id,
            raw: params.raw_event
        });

        // UI Notification: concise
        if (params.source === 'terminal_error' || params.source === 'stream_exception') {
            toast.error("Stream Error", {
                description: params.message,
                action: params.retryable ? {
                    label: "Retry",
                    onClick: () => console.log("Retry clicked")
                } : undefined
            });
        }

        return { logged: true, masked_fields: [] };
    }
};

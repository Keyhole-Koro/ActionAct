import { create } from 'zustand';
import { SelectionGroup } from '../types';

interface AgentInteractionState {
    groups: Record<string, SelectionGroup>;

    // Actions for agent integration
    createGroup: (group: Omit<SelectionGroup, 'status' | 'expires_at_timestamp'>) => void;
    expireGroup: (groupId: string) => void;
    cancelGroup: (groupId: string) => void;
    confirmSelection: (groupId: string) => void;
    clearSelection: (groupId: string) => void;

    // Actions for UI interaction
    toggleOptionSelection: (groupId: string, optionId: string) => void;
}

export const useAgentInteractionStore = create<AgentInteractionState>((set) => ({
    groups: {},

    createGroup: (group) => set((state) => {
        const now = Date.now();
        const expiresAt = group.expires_in_ms ? now + group.expires_in_ms : null;
        if (group.expires_in_ms) {
            window.setTimeout(() => {
                useAgentInteractionStore.getState().expireGroup(group.selection_group_id);
            }, group.expires_in_ms);
        }

        return {
            groups: {
                ...state.groups,
                [group.selection_group_id]: {
                    ...group,
                    status: 'pending',
                    expires_at_timestamp: expiresAt,
                }
            }
        };
    }),

    expireGroup: (groupId) => set((state) => {
        const group = state.groups[groupId];
        if (!group || group.status !== 'pending') return state;
        return {
            groups: {
                ...state.groups,
                [groupId]: { ...group, status: 'expired' }
            }
        };
    }),

    cancelGroup: (groupId) => set((state) => {
        const group = state.groups[groupId];
        if (!group || group.status !== 'pending') return state;
        return {
            groups: {
                ...state.groups,
                [groupId]: { ...group, status: 'cancelled' }
            }
        };
    }),

    confirmSelection: (groupId) => set((state) => {
        const group = state.groups[groupId];
        if (!group || group.status !== 'pending') return state;

        const hasSelection = group.options.some((option) => option.selected);
        if (!hasSelection) return state;

        return {
            groups: {
                ...state.groups,
                [groupId]: { ...group, status: 'selected' }
            }
        };
    }),

    clearSelection: (groupId) => set((state) => {
        const group = state.groups[groupId];
        if (!group || group.status !== 'pending') return state;

        return {
            groups: {
                ...state.groups,
                [groupId]: {
                    ...group,
                    options: group.options.map(opt => ({ ...opt, selected: false }))
                }
            }
        };
    }),

    toggleOptionSelection: (groupId, optionId) => set((state) => {
        const group = state.groups[groupId];
        if (!group || group.status !== 'pending') return state;

        let newOptions;
        if (group.selection_mode === 'single') {
            newOptions = group.options.map(opt => ({
                ...opt,
                selected: opt.option_id === optionId
            }));

            // Single select implies immediate confirmation based on spec
            return {
                groups: {
                    ...state.groups,
                    [groupId]: {
                        ...group,
                        status: 'selected',
                        options: newOptions
                    }
                }
            };
        } else {
            // Multiple select
            newOptions = group.options.map(opt =>
                opt.option_id === optionId
                    ? { ...opt, selected: !opt.selected }
                    : opt
            );
            return {
                groups: {
                    ...state.groups,
                    [groupId]: {
                        ...group,
                        options: newOptions
                    }
                }
            };
        }
    }),
}));

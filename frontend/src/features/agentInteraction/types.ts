export type SelectionMode = 'single' | 'multiple';
export type SelectionStatus = 'pending' | 'selected' | 'expired' | 'cancelled';

export interface SelectionOption {
    option_id: string;
    label: string;
    reason?: string | null;
    content_md?: string | null;
    parameters?: Record<string, unknown> | null;
    selected: boolean;
    metadata?: Record<string, unknown> | null;
}

// Internal UI representation of an option
export interface UiSelectionOption extends SelectionOption {
    selected: boolean;
}

export interface SelectionNodeData extends Record<string, unknown> {
    groupId: string;
    optionId: string;
    label: string;
    mode: SelectionMode;
    status: SelectionStatus;
    isSelected: boolean;
    onSelect: () => void;
}

export interface SelectionHeaderData extends Record<string, unknown> {
    selection_group_id: string;
    groupId: string;
    title: string;
    instruction: string;
    selection_mode: SelectionMode;
    status: SelectionStatus;
    options: SelectionOption[];
    expiresInMs?: number | null;
    expiresAtTimestamp?: number | null;
}

export interface SelectionGroup {
    selection_group_id: string;
    title: string;
    instruction: string;
    selection_mode: SelectionMode;
    anchor_node_id?: string | null;
    expires_in_ms?: number | null;
    expires_at_timestamp?: number | null; // calculated when created
    status: SelectionStatus;
    options: UiSelectionOption[];
}

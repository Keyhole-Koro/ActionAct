export type SelectionMode = 'single' | 'multiple';
export type SelectionStatus = 'pending' | 'selected' | 'expired' | 'cancelled';

export interface SelectionOption {
    option_id: string;
    label: string;
    content_md?: string | null;
    parent_id?: string | null;
    metadata?: Record<string, unknown> | null;
}

// Internal UI representation of an option
export interface UiSelectionOption extends SelectionOption {
    selected: boolean;
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

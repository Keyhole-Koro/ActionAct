package domain

import "context"

type ActDecisionVisibleNode struct {
	NodeID    string `json:"node_id"`
	Title     string `json:"title"`
	ContentMD string `json:"content_md,omitempty"`
	Selected  bool   `json:"selected,omitempty"`
	Source    string `json:"source,omitempty"`
}

type ActDecisionCandidate struct {
	NodeID string `json:"node_id"`
	Label  string `json:"label"`
	Reason string `json:"reason,omitempty"`
}

type PromptDebugInfo struct {
	SystemInstruction string   `json:"system_instruction,omitempty"`
	UserPrompt        string   `json:"user_prompt,omitempty"`
	ContextBlocks     []string `json:"context_blocks,omitempty"`
}

type ActDecisionInput struct {
	UID             string
	TraceID         string
	WorkspaceID     string
	TopicID         string
	UserMessage     string
	ActiveNodeID    string
	SelectedNodeIDs []string
	AvailableTools  []string
	Nodes           []ActDecisionVisibleNode
}

type ActDecisionResult struct {
	Action          string                 `json:"action"`
	Message         string                 `json:"message,omitempty"`
	SuggestedAction string                 `json:"suggested_action,omitempty"`
	ContextNodeIDs  []string               `json:"context_node_ids,omitempty"`
	Candidates      []ActDecisionCandidate `json:"candidates,omitempty"`
	DebugPrompt     *PromptDebugInfo       `json:"debug_prompt,omitempty"`
}

type ActDecisionResolver interface {
	Resolve(ctx context.Context, input ActDecisionInput) (ActDecisionResult, error)
}

package domain

import "context"

type CandidateVisibleNode struct {
	NodeID    string `json:"node_id"`
	Title     string `json:"title"`
	ContentMD string `json:"content_md,omitempty"`
	Selected  bool   `json:"selected,omitempty"`
	Source    string `json:"source,omitempty"`
}

type NodeCandidate struct {
	NodeID string `json:"node_id"`
	Label  string `json:"label"`
	Reason string `json:"reason,omitempty"`
}

type ResolveNodeCandidatesInput struct {
	UID             string
	TraceID         string
	WorkspaceID     string
	TopicID         string
	UserMessage     string
	ActiveNodeID    string
	SelectedNodeIDs []string
	MaxCandidates   int
	Nodes           []CandidateVisibleNode
}

type NodeCandidateResolver interface {
	Resolve(ctx context.Context, input ResolveNodeCandidatesInput) ([]NodeCandidate, error)
}

package domain

import (
	"context"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
)

// RunActInput is the validated, auth-verified input for an Act execution.
type RunActInput struct {
	UID                  string
	TraceID              string
	RequestID            string
	TopicID              string
	WorkspaceID          string
	UserMessage          string
	UserMedia            []MediaData
	ActType              string
	AnchorID             string
	ContextIDs           []string
	SelectedNodeContexts []SelectedNodeContext
}

type SelectedNodeContext struct {
	NodeID         string
	Label          string
	Kind           string
	ContextSummary string
	ContentMD      string
	ThoughtMD      string
	DetailHTML     string
}

type MediaData struct {
	MimeType string
	Data     []byte
}

// ActExecutor sends the validated request to the downstream worker
// and streams results back to the client.
type ActExecutor interface {
	Execute(ctx context.Context, input RunActInput, stream *connect.ServerStream[actv1.RunActEvent]) error
}

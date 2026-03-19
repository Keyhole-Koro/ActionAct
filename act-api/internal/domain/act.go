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
	UserMediaRefs        []MediaRef
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

// MediaRef points to a file already stored in GCS.
// Files must be uploaded to GCS first via /api/upload/presign.
type MediaRef struct {
	MimeType     string
	GCSObjectKey string // object path within the bucket, e.g. "mind/inputs/in_abc.raw"
	SizeBytes    int64
}

// ActExecutor sends the validated request to the downstream worker
// and streams results back to the client.
type ActExecutor interface {
	Execute(ctx context.Context, input RunActInput, stream *connect.ServerStream[actv1.RunActEvent]) error
}

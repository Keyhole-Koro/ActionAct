package adapter

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
)

type FirestoreActRunRecorder struct {
	client *firestore.Client
}

func NewFirestoreActRunRecorder(ctx context.Context, project string) (*FirestoreActRunRecorder, error) {
	client, err := firestore.NewClient(ctx, project)
	if err != nil {
		return nil, fmt.Errorf("create firestore client: %w", err)
	}
	return &FirestoreActRunRecorder{client: client}, nil
}

func (r *FirestoreActRunRecorder) Start(ctx context.Context, input domain.RunActInput) error {
	_, err := r.runDoc(input).Set(ctx, map[string]any{
		"traceId":   input.TraceID,
		"requestId": input.RequestID,
		"uid":       input.UID,
		"status":    "running",
		"startedAt": firestore.ServerTimestamp,
		"endedAt":   nil,
	}, firestore.MergeAll)
	return err
}

func (r *FirestoreActRunRecorder) AppendEvent(ctx context.Context, input domain.RunActInput, seq int, evt *actv1.RunActEvent) error {
	payload := map[string]any{
		"traceId":   input.TraceID,
		"seq":       seq,
		"createdAt": firestore.ServerTimestamp,
	}

	if text := evt.GetTextDelta(); text != nil {
		payload["textDelta"] = text.GetText()
		payload["isThought"] = evt.GetIsThought()
	}
	if patchOps := evt.GetPatchOps(); patchOps != nil {
		ops := make([]map[string]any, 0, len(patchOps.GetOps()))
		for _, op := range patchOps.GetOps() {
			payloadOp := map[string]any{
				"op":      op.GetOp(),
				"nodeId":  op.GetNodeId(),
				"content": op.GetContent(),
			}
			if op.GetSeq() > 0 {
				payloadOp["seq"] = int64(op.GetSeq())
				payloadOp["expectedOffset"] = int64(op.GetExpectedOffset())
			}
			ops = append(ops, payloadOp)
		}
		payload["patchOps"] = ops
	}
	if terminal := evt.GetTerminal(); terminal != nil {
		if terminal.GetDone() {
			payload["terminal"] = "done"
		}
		if terminal.GetError() != nil {
			payload["terminal"] = "error"
			payload["error"] = map[string]any{
				"code":         terminal.GetError().GetCode(),
				"message":      terminal.GetError().GetMessage(),
				"retryable":    terminal.GetError().GetRetryable(),
				"stage":        terminal.GetError().GetStage(),
				"traceId":      terminal.GetError().GetTraceId(),
				"retryAfterMs": terminal.GetError().GetRetryAfterMs(),
			}
		}
	}

	_, err := r.eventDoc(input, seq).Set(ctx, payload)
	return err
}

func (r *FirestoreActRunRecorder) Finish(ctx context.Context, input domain.RunActInput, status string, terminal *actv1.Terminal) error {
	payload := map[string]any{
		"status":  status,
		"endedAt": firestore.ServerTimestamp,
	}
	if terminal != nil && terminal.GetError() != nil {
		payload["error"] = map[string]any{
			"code":         terminal.GetError().GetCode(),
			"message":      terminal.GetError().GetMessage(),
			"retryable":    terminal.GetError().GetRetryable(),
			"stage":        terminal.GetError().GetStage(),
			"traceId":      terminal.GetError().GetTraceId(),
			"retryAfterMs": terminal.GetError().GetRetryAfterMs(),
		}
	}
	_, err := r.runDoc(input).Set(ctx, payload, firestore.MergeAll)
	return err
}

func (r *FirestoreActRunRecorder) Close() error {
	return r.client.Close()
}

func (r *FirestoreActRunRecorder) runDoc(input domain.RunActInput) *firestore.DocumentRef {
	return r.client.Doc(fmt.Sprintf(
		"workspaces/%s/topics/%s/actRuns/%s",
		input.WorkspaceID,
		input.TopicID,
		input.TraceID,
	))
}

func (r *FirestoreActRunRecorder) eventDoc(input domain.RunActInput, seq int) *firestore.DocumentRef {
	return r.client.Doc(fmt.Sprintf(
		"workspaces/%s/topics/%s/actRuns/%s/events/%s",
		input.WorkspaceID,
		input.TopicID,
		input.TraceID,
		zeroPadSeq(seq),
	))
}

func zeroPadSeq(seq int) string {
	return fmt.Sprintf("%06d", seq)
}

var _ interface{ Close() error } = (*FirestoreActRunRecorder)(nil)
var _ domain.ActRunRecorder = (*FirestoreActRunRecorder)(nil)

package domain

import (
	"context"

	actv1 "act-api/gen/act/v1"
)

// ActRunRecorder persists actRuns and their emitted stream events.
// Recording is best-effort and must not block the user-visible stream.
type ActRunRecorder interface {
	Start(ctx context.Context, input RunActInput) error
	AppendEvent(ctx context.Context, input RunActInput, seq int, evt *actv1.RunActEvent) error
	Finish(ctx context.Context, input RunActInput, status string, terminal *actv1.Terminal) error
}

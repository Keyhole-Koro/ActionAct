package adapter

import (
	"context"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
)

// StubActExecutor is a placeholder implementation of domain.ActExecutor.
// It echoes the user message back as a single upsert patch, then sends Terminal{Done: true}.
// TODO: Replace with real ADK Worker HTTP forwarding.
type StubActExecutor struct {
	WorkerURL string
}

func NewStubActExecutor(workerURL string) *StubActExecutor {
	return &StubActExecutor{WorkerURL: workerURL}
}

func (e *StubActExecutor) Execute(
	ctx context.Context,
	input domain.RunActInput,
	stream *connect.ServerStream[actv1.RunActEvent],
) error {
	// Stub: echo user message as a single upsert patch
	if err := stream.Send(&actv1.RunActEvent{
		Event: &actv1.RunActEvent_PatchOps{
			PatchOps: &actv1.PatchOps{
				Ops: []*actv1.PatchOp{
					{Op: "upsert", NodeId: "root", Content: input.UserMessage},
				},
			},
		},
	}); err != nil {
		return err
	}

	return stream.Send(&actv1.RunActEvent{
		Event: &actv1.RunActEvent_Terminal{
			Terminal: &actv1.Terminal{Done: true},
		},
	})
}

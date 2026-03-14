package domain

import (
	"context"

	actv1 "act-api/gen/act/v1"
)

type IdempotencyStatus string

const (
	IdempotencyMiss     IdempotencyStatus = "MISS"
	IdempotencyInFlight IdempotencyStatus = "IN_FLIGHT"
	IdempotencyDone     IdempotencyStatus = "DONE"
)

type IdempotencyResult struct {
	Status       IdempotencyStatus
	Terminal     *actv1.Terminal
	RetryAfterMs int64
}

type IdempotencyGate interface {
	Begin(ctx context.Context, uid, workspaceID, requestID string) (IdempotencyResult, error)
	Complete(ctx context.Context, uid, workspaceID, requestID string, terminal *actv1.Terminal) error
	Release(ctx context.Context, uid, workspaceID, requestID string) error
}

package adapter

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
)

const idemRetryAfterMs int64 = 3000

type RedisIdempotencyGate struct {
	rdb         *redis.Client
	lockTTL     time.Duration
	snapshotTTL time.Duration
}

type terminalSnapshot struct {
	Done  bool               `json:"done,omitempty"`
	Error *terminalErrorJSON `json:"error,omitempty"`
}

type terminalErrorJSON struct {
	Code         string `json:"code"`
	Message      string `json:"message"`
	Retryable    bool   `json:"retryable"`
	Stage        string `json:"stage"`
	TraceID      string `json:"trace_id"`
	RetryAfterMs int64  `json:"retry_after_ms"`
}

func NewRedisIdempotencyGate(rdb *redis.Client, lockTTLSeconds int, snapshotTTLSeconds int) *RedisIdempotencyGate {
	return &RedisIdempotencyGate{
		rdb:         rdb,
		lockTTL:     time.Duration(lockTTLSeconds) * time.Second,
		snapshotTTL: time.Duration(snapshotTTLSeconds) * time.Second,
	}
}

func (g *RedisIdempotencyGate) Begin(ctx context.Context, uid, workspaceID, requestID string) (domain.IdempotencyResult, error) {
	if raw, err := g.rdb.Get(ctx, g.idemKey(uid, workspaceID, requestID)).Result(); err == nil {
		terminal, decodeErr := decodeTerminalSnapshot(raw)
		if decodeErr != nil {
			return domain.IdempotencyResult{}, fmt.Errorf("decode idempotency snapshot: %w", decodeErr)
		}
		return domain.IdempotencyResult{
			Status:   domain.IdempotencyDone,
			Terminal: terminal,
		}, nil
	} else if !errors.Is(err, redis.Nil) {
		return domain.IdempotencyResult{}, fmt.Errorf("read idempotency snapshot: %w", err)
	}

	acquired, err := g.rdb.SetNX(ctx, g.lockKey(uid, workspaceID, requestID), "1", g.lockTTL).Result()
	if err != nil {
		return domain.IdempotencyResult{}, fmt.Errorf("acquire idempotency lock: %w", err)
	}
	if !acquired {
		return domain.IdempotencyResult{
			Status:       domain.IdempotencyInFlight,
			RetryAfterMs: idemRetryAfterMs,
		}, nil
	}
	return domain.IdempotencyResult{Status: domain.IdempotencyMiss}, nil
}

func (g *RedisIdempotencyGate) Complete(ctx context.Context, uid, workspaceID, requestID string, terminal *actv1.Terminal) error {
	if terminal == nil {
		return errors.New("terminal is required")
	}
	raw, err := encodeTerminalSnapshot(terminal)
	if err != nil {
		return fmt.Errorf("encode terminal snapshot: %w", err)
	}
	pipe := g.rdb.TxPipeline()
	pipe.Set(ctx, g.idemKey(uid, workspaceID, requestID), raw, g.snapshotTTL)
	pipe.Del(ctx, g.lockKey(uid, workspaceID, requestID))
	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("persist idempotency snapshot: %w", err)
	}
	return nil
}

func (g *RedisIdempotencyGate) Release(ctx context.Context, uid, workspaceID, requestID string) error {
	if err := g.rdb.Del(ctx, g.lockKey(uid, workspaceID, requestID)).Err(); err != nil {
		return fmt.Errorf("release idempotency lock: %w", err)
	}
	return nil
}

func (g *RedisIdempotencyGate) lockKey(uid, workspaceID, requestID string) string {
	return fmt.Sprintf("lock:req:%s:%s:%s", uid, workspaceID, requestID)
}

func (g *RedisIdempotencyGate) idemKey(uid, workspaceID, requestID string) string {
	return fmt.Sprintf("idem:%s:%s:%s", uid, workspaceID, requestID)
}

func encodeTerminalSnapshot(terminal *actv1.Terminal) (string, error) {
	snapshot := terminalSnapshot{Done: terminal.GetDone()}
	if terminal.GetError() != nil {
		snapshot.Error = &terminalErrorJSON{
			Code:         terminal.GetError().GetCode(),
			Message:      terminal.GetError().GetMessage(),
			Retryable:    terminal.GetError().GetRetryable(),
			Stage:        terminal.GetError().GetStage(),
			TraceID:      terminal.GetError().GetTraceId(),
			RetryAfterMs: terminal.GetError().GetRetryAfterMs(),
		}
	}
	buf, err := json.Marshal(snapshot)
	if err != nil {
		return "", err
	}
	return string(buf), nil
}

func decodeTerminalSnapshot(raw string) (*actv1.Terminal, error) {
	var snapshot terminalSnapshot
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return nil, err
	}
	terminal := &actv1.Terminal{Done: snapshot.Done}
	if snapshot.Error != nil {
		terminal.Error = &actv1.ErrorInfo{
			Code:         snapshot.Error.Code,
			Message:      snapshot.Error.Message,
			Retryable:    snapshot.Error.Retryable,
			Stage:        snapshot.Error.Stage,
			TraceId:      snapshot.Error.TraceID,
			RetryAfterMs: snapshot.Error.RetryAfterMs,
		}
	}
	return terminal, nil
}

var _ domain.IdempotencyGate = (*RedisIdempotencyGate)(nil)

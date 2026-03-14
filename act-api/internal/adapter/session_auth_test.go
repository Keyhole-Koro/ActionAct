package adapter_test

import (
	"context"
	"errors"
	"testing"

	"act-api/internal/adapter"
	"act-api/internal/domain"

	"github.com/redis/go-redis/v9"
)

// We test RedisSessionValidator using a real redis.NewClient pointed at a fake address.
// Since we can't run a real Redis in unit tests, we test the non-Redis paths (empty sid)
// and verify the interface contract.

func TestRedisSession_EmptySID_Strict(t *testing.T) {
	// We pass nil for redis client since it won't be used
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:0"})
	v := adapter.NewRedisSessionValidator(rdb, true)

	err := v.ValidateSID(context.Background(), "user-1", "")
	if !errors.Is(err, domain.ErrSessionInvalid) {
		t.Errorf("strict mode empty sid: got %v, want ErrSessionInvalid", err)
	}
}

func TestRedisSession_EmptySID_NonStrict(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:0"})
	v := adapter.NewRedisSessionValidator(rdb, false)

	err := v.ValidateSID(context.Background(), "user-1", "")
	if err != nil {
		t.Errorf("non-strict mode empty sid: got %v, want nil", err)
	}
}

func TestRedisSession_RedisUnavailable(t *testing.T) {
	// Connect to a non-existent Redis to trigger connection error
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:1"})
	v := adapter.NewRedisSessionValidator(rdb, false)

	err := v.ValidateSID(context.Background(), "user-1", "some-sid")
	if err == nil {
		t.Fatal("expected error for unreachable Redis")
	}
	// Should NOT be ErrSessionInvalid — it's a connection error, not invalid session
	if errors.Is(err, domain.ErrSessionInvalid) {
		t.Error("expected connection error, not ErrSessionInvalid")
	}
	// Error message should indicate Redis problem
	if !containsSubstring(err.Error(), "redis") {
		t.Errorf("error should mention redis: %v", err)
	}
}

func TestFirebaseAuth_MissingBearerPrefix(t *testing.T) {
	// Can't unit-test with real Firebase client, but we can test header parsing
	v := adapter.NewFirebaseAuthVerifier(nil) // nil client — we'll fail before using it

	_, err := v.VerifyToken(context.Background(), "NotBearer token")
	if err == nil {
		t.Fatal("expected error for missing Bearer prefix")
	}
	if !errors.Is(err, domain.ErrUnauthenticated) {
		t.Errorf("expected ErrUnauthenticated, got %v", err)
	}
}

func TestFirebaseAuth_EmptyHeader(t *testing.T) {
	v := adapter.NewFirebaseAuthVerifier(nil)

	_, err := v.VerifyToken(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty auth header")
	}
	if !errors.Is(err, domain.ErrUnauthenticated) {
		t.Errorf("expected ErrUnauthenticated, got %v", err)
	}
}


func containsSubstring(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

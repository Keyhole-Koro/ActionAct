package adapter

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisSessionIssuer struct {
	rdb     *redis.Client
	sidTTL  time.Duration
	csrfTTL time.Duration
}

func NewRedisSessionIssuer(rdb *redis.Client, sidTTLSeconds int, csrfTTLSeconds int) *RedisSessionIssuer {
	return &RedisSessionIssuer{
		rdb:     rdb,
		sidTTL:  time.Duration(sidTTLSeconds) * time.Second,
		csrfTTL: time.Duration(csrfTTLSeconds) * time.Second,
	}
}

func (i *RedisSessionIssuer) Issue(ctx context.Context, uid string) (sid string, csrfToken string, err error) {
	sid, err = randomToken(32)
	if err != nil {
		return "", "", fmt.Errorf("generate sid: %w", err)
	}
	csrfToken, err = randomToken(32)
	if err != nil {
		return "", "", fmt.Errorf("generate csrf token: %w", err)
	}

	if err := i.rdb.Set(ctx, "sid:"+sid, uid, i.sidTTL).Err(); err != nil {
		return "", "", fmt.Errorf("persist sid: %w", err)
	}

	return sid, csrfToken, nil
}

func randomToken(numBytes int) (string, error) {
	buf := make([]byte, numBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

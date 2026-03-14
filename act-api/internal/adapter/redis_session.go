package adapter

import (
	"context"
	"errors"
	"fmt"

	"github.com/redis/go-redis/v9"

	"act-api/internal/domain"
)

// RedisSessionValidator implements domain.SessionValidator using Redis.
type RedisSessionValidator struct {
	rdb    *redis.Client
	strict bool // if true, empty sid is an error
}

func NewRedisSessionValidator(rdb *redis.Client, strict bool) *RedisSessionValidator {
	return &RedisSessionValidator{rdb: rdb, strict: strict}
}

func (v *RedisSessionValidator) ValidateSID(ctx context.Context, uid, sid string) error {
	if sid == "" {
		if v.strict {
			return domain.ErrSessionInvalid
		}
		return nil // non-strict mode: skip validation when no sid
	}
	val, err := v.rdb.Get(ctx, "sid:"+sid).Result()
	if errors.Is(err, redis.Nil) {
		return domain.ErrSessionInvalid
	}
	if err != nil {
		return fmt.Errorf("redis unavailable: %w", err)
	}
	if val != uid {
		return domain.ErrSessionInvalid
	}
	return nil
}

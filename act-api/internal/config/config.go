package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port              string
	RedisAddr         string
	RedisDB           int
	ADKWorkerURL      string
	GCloudProject     string
	SIDStrict         bool
	SIDReqTTLSeconds  int
	SIDLockTTLSeconds int
}

func MustLoad() *Config {
	return &Config{
		Port:              mustEnv("PORT"),
		RedisAddr:         mustEnv("REDIS_ADDR"),
		RedisDB:           optionalInt("REDIS_DB", 0),
		ADKWorkerURL:      mustEnv("ACT_ADK_WORKER_URL"),
		GCloudProject:     mustEnv("GOOGLE_CLOUD_PROJECT"),
		SIDStrict:         optionalBool("SID_STRICT", true),
		SIDReqTTLSeconds:  optionalInt("SID_REQ_TTL_SECONDS", 900),
		SIDLockTTLSeconds: optionalInt("SID_LOCK_TTL_SECONDS", 10),
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}

func optionalInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		panic(fmt.Sprintf("environment variable %q must be an integer: %v", key, err))
	}
	return i
}

func optionalBool(key string, def bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		panic(fmt.Sprintf("environment variable %q must be a boolean: %v", key, err))
	}
	return b
}

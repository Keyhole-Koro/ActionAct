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
		RedisDB:           mustIntEnv("REDIS_DB"),
		ADKWorkerURL:      mustEnv("ACT_ADK_WORKER_URL"),
		GCloudProject:     mustEnv("GOOGLE_CLOUD_PROJECT"),
		SIDStrict:         mustBoolEnv("SID_STRICT"),
		SIDReqTTLSeconds:  mustIntEnv("SID_REQ_TTL_SECONDS"),
		SIDLockTTLSeconds: mustIntEnv("SID_LOCK_TTL_SECONDS"),
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}

func mustIntEnv(key string) int {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		panic(fmt.Sprintf("environment variable %q must be an integer: %v", key, err))
	}
	return i
}

func mustBoolEnv(key string) bool {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		panic(fmt.Sprintf("environment variable %q must be a boolean: %v", key, err))
	}
	return b
}

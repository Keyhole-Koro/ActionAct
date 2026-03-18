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
	GCSBucket         string
	PubSubTopic       string
	StorageEmulatorHost string
	PubSubEmulatorHost  string
	SIDStrict         bool
	SIDTTLSeconds     int
	CSRFTTLSeconds    int
	SIDReqTTLSeconds  int
	SIDLockTTLSeconds int
}

func MustLoad() *Config {
	pubsubTopic := os.Getenv("PUBSUB_TOPIC")
	if pubsubTopic == "" {
		pubsubTopic = "mind-events"
	}
	return &Config{
		Port:              mustEnv("PORT"),
		RedisAddr:         mustEnv("REDIS_ADDR"),
		RedisDB:           mustIntEnv("REDIS_DB"),
		ADKWorkerURL:      mustEnv("ACT_ADK_WORKER_URL"),
		GCloudProject:     mustEnv("GOOGLE_CLOUD_PROJECT"),
		GCSBucket:         mustEnv("GCS_BUCKET"),
		PubSubTopic:       pubsubTopic,
		StorageEmulatorHost: os.Getenv("STORAGE_EMULATOR_HOST"),
		PubSubEmulatorHost:  os.Getenv("PUBSUB_EMULATOR_HOST"),
		SIDStrict:         mustBoolEnv("SID_STRICT"),
		SIDTTLSeconds:     mustIntEnv("SID_TTL_SECONDS"),
		CSRFTTLSeconds:    mustIntEnv("CSRF_TTL_SECONDS"),
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

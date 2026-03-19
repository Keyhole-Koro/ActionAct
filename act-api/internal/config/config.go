package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port              string
	RedisAddr         string
	RedisDB           int
	ADKWorkerURL      string
	ADKWorkerAuthMode string
	ADKWorkerAudience string
	GCloudProject     string
	GCSBucket         string
	PubSubTopic       string
	AllowedOrigins    []string
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
	workerURL := mustEnv("ACT_ADK_WORKER_URL")
	workerAuthMode := optionalEnv("ADK_WORKER_AUTH_MODE", "auto")
	workerAudience := optionalEnv("ADK_WORKER_AUDIENCE", workerURL)

	allowedOrigins := optionalCSVEnv("ALLOWED_ORIGINS", []string{"http://localhost:3000",})

	return &Config{
		Port:              mustEnv("PORT"),
		RedisAddr:         mustEnv("REDIS_ADDR"),
		RedisDB:           mustIntEnv("REDIS_DB"),
		ADKWorkerURL:      workerURL,
		ADKWorkerAuthMode: workerAuthMode,
		ADKWorkerAudience: workerAudience,
		GCloudProject:     mustEnv("GOOGLE_CLOUD_PROJECT"),
		GCSBucket:         mustEnv("GCS_BUCKET"),
		PubSubTopic:       pubsubTopic,
		AllowedOrigins:    allowedOrigins,
		SIDStrict:         mustBoolEnv("SID_STRICT"),
		SIDTTLSeconds:     mustIntEnv("SID_TTL_SECONDS"),
		CSRFTTLSeconds:    mustIntEnv("CSRF_TTL_SECONDS"),
		SIDReqTTLSeconds:  mustIntEnv("SID_REQ_TTL_SECONDS"),
		SIDLockTTLSeconds: mustIntEnv("SID_LOCK_TTL_SECONDS"),
	}
}

func optionalCSVEnv(key string, def []string) []string {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		return def
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		s := strings.TrimSpace(p)
		if s != "" {
			out = append(out, s)
		}
	}
	if len(out) == 0 {
		return def
	}
	return out
}

func optionalEnv(key, def string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	return v
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

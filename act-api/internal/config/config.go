package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                 string
	RedisAddr            string
	RedisDB              int
	CORSAllowedOrigins   []string
	ADKWorkerURL         string
	GCloudProject        string
	GCSBucket            string
	PubSubTopic          string
	DiscordApplicationID string
	StorageEmulatorHost  string
	PubSubEmulatorHost   string
	// UploadProxyOrigin, when set, causes /api/upload/presign to return a
	// proxy URL pointing at this origin instead of a real GCS signed URL.
	// Use for local development: e.g. "http://localhost:8080".
	UploadProxyOrigin string
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

	cfg := &Config{
		Port:                 mustEnv("PORT"),
		RedisAddr:            mustEnv("REDIS_ADDR"),
		RedisDB:              mustIntEnv("REDIS_DB"),
		CORSAllowedOrigins:   mustCSVEnv("CORS_ALLOWED_ORIGINS"),
		ADKWorkerURL:         mustEnv("ACT_ADK_WORKER_URL"),
		GCloudProject:        mustEnv("GOOGLE_CLOUD_PROJECT"),
		GCSBucket:            mustEnv("GCS_BUCKET"),
		PubSubTopic:          pubsubTopic,
		DiscordApplicationID: mustEnv("DISCORD_APPLICATION_ID"),
		StorageEmulatorHost:  os.Getenv("STORAGE_EMULATOR_HOST"),
		PubSubEmulatorHost:   os.Getenv("PUBSUB_EMULATOR_HOST"),
		UploadProxyOrigin:    os.Getenv("UPLOAD_PROXY_ORIGIN"),
		SIDStrict:            mustBoolEnv("SID_STRICT"),
		SIDTTLSeconds:        mustIntEnv("SID_TTL_SECONDS"),
		CSRFTTLSeconds:       mustIntEnv("CSRF_TTL_SECONDS"),
		SIDReqTTLSeconds:     mustIntEnv("SID_REQ_TTL_SECONDS"),
		SIDLockTTLSeconds:    mustIntEnv("SID_LOCK_TTL_SECONDS"),
	}

	fmt.Printf("[CONFIG DEBUG] STORAGE_EMULATOR_HOST: %q\n", cfg.StorageEmulatorHost)
	fmt.Printf("[CONFIG DEBUG] PUBSUB_EMULATOR_HOST: %q\n", cfg.PubSubEmulatorHost)
	fmt.Printf("[CONFIG DEBUG] GCS_BUCKET: %q\n", cfg.GCSBucket)

	return cfg
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

func mustCSVEnv(key string) []string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}

	rawItems := strings.Split(v, ",")
	items := make([]string, 0, len(rawItems))
	for _, item := range rawItems {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			items = append(items, trimmed)
		}
	}

	if len(items) == 0 {
		panic(fmt.Sprintf("environment variable %q must contain at least one origin", key))
	}

	return items
}

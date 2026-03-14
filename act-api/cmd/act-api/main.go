package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	firebase "firebase.google.com/go/v4"
	"github.com/redis/go-redis/v9"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"act-api/gen/act/v1/actv1connect"
	"act-api/internal/config"
	"act-api/internal/handler"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg := config.MustLoad()
	ctx := context.Background()

	// Firebase Admin SDK の初期化。
	// FIREBASE_AUTH_EMULATOR_HOST が設定されていれば自動的にエミュレーターを使う。
	app, err := firebase.NewApp(ctx, &firebase.Config{
		ProjectID: cfg.GCloudProject,
	})
	if err != nil {
		slog.Error("firebase.NewApp failed", "err", err)
		os.Exit(1)
	}
	authClient, err := app.Auth(ctx)
	if err != nil {
		slog.Error("firebase.Auth failed", "err", err)
		os.Exit(1)
	}

	// Redis クライアントの初期化。接続失敗は起動時に即 exit。
	rdb := redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
		DB:   cfg.RedisDB,
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Error("redis ping failed", "addr", cfg.RedisAddr, "err", err)
		os.Exit(1)
	}

	h := handler.NewRunActHandler(handler.Config{
		FirebaseAuth:      authClient,
		Redis:             rdb,
		ADKWorkerURL:      cfg.ADKWorkerURL,
		SIDStrict:         cfg.SIDStrict,
		SIDReqTTL:         time.Duration(cfg.SIDReqTTLSeconds) * time.Second,
		SIDLockTTL:        time.Duration(cfg.SIDLockTTLSeconds) * time.Second,
	})

	mux := http.NewServeMux()
	path, connectHandler := actv1connect.NewActServiceHandler(h)
	mux.Handle(path, connectHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: h2c.NewHandler(mux, &http2.Server{}),
	}

	slog.Info("act-api listening", "addr", srv.Addr, "adk_worker_url", cfg.ADKWorkerURL)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}

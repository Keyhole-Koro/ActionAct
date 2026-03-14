package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	firebase "firebase.google.com/go/v4"
	"github.com/redis/go-redis/v9"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"act-api/gen/act/v1/actv1connect"
	"act-api/internal/adapter"
	"act-api/internal/config"
	"act-api/internal/handler"
	"act-api/internal/usecase"
)

const devFrontendOrigin = "http://localhost:3000"

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg := config.MustLoad()
	ctx := context.Background()

	// ── Firebase ──
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

	// ── Redis ──
	rdb := redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
		DB:   cfg.RedisDB,
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		slog.Error("redis ping failed", "addr", cfg.RedisAddr, "err", err)
		os.Exit(1)
	}

	// ── Adapter layer (DI) ──
	authVerifier := adapter.NewFirebaseAuthVerifier(authClient)
	sessionValidator := adapter.NewRedisSessionValidator(rdb, cfg.SIDStrict)
	sessionIssuer := adapter.NewRedisSessionIssuer(rdb, cfg.SIDTTLSeconds, cfg.CSRFTTLSeconds)
	csrfValidator := adapter.NewDoubleSubmitCSRFValidator()
	actExecutor := adapter.NewADKWorkerExecutor(cfg.ADKWorkerURL)

	// ── Usecase layer ──
	uc := usecase.NewRunActUsecase(authVerifier, sessionValidator, csrfValidator, actExecutor)

	// ── Handler layer ──
	h := handler.NewRunActHandler(uc)
	sessionBootstrapHandler := handler.NewSessionBootstrapHandler(
		authVerifier,
		sessionIssuer,
		cfg.SIDTTLSeconds,
		cfg.CSRFTTLSeconds,
	)

	mux := http.NewServeMux()
	path, connectHandler := actv1connect.NewActServiceHandler(h)
	mux.Handle(path, connectHandler)
	mux.Handle("/auth/session/bootstrap", sessionBootstrapHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: withCORS(h2c.NewHandler(mux, &http2.Server{})),
	}

	slog.Info("act-api listening", "addr", srv.Addr, "adk_worker_url", cfg.ADKWorkerURL)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == devFrontendOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, Connect-Protocol-Version, Connect-Timeout-Ms")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}

		if r.Method == http.MethodOptions {
			if origin != devFrontendOrigin {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

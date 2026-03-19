package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	"cloud.google.com/go/pubsub"
	"cloud.google.com/go/storage"
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
	authzVerifier, err := adapter.NewFirestoreAuthzVerifier(ctx, cfg.GCloudProject)
	if err != nil {
		slog.Error("firestore authz verifier init failed", "err", err)
		os.Exit(1)
	}
	defer authzVerifier.Close()
	sessionValidator := adapter.NewRedisSessionValidator(rdb, cfg.SIDStrict)
	sessionIssuer := adapter.NewRedisSessionIssuer(rdb, cfg.SIDTTLSeconds, cfg.CSRFTTLSeconds)
	idempotencyGate := adapter.NewRedisIdempotencyGate(rdb, cfg.SIDLockTTLSeconds, cfg.SIDReqTTLSeconds)
	csrfValidator := adapter.NewDoubleSubmitCSRFValidator()
	actRunRecorder, err := adapter.NewFirestoreActRunRecorder(ctx, cfg.GCloudProject)
	if err != nil {
		slog.Error("firestore actRuns recorder init failed", "err", err)
		os.Exit(1)
	}
	defer actRunRecorder.Close()
	workerAuthorizer, err := adapter.NewADKWorkerRequestAuthorizer(
		ctx,
		cfg.ADKWorkerURL,
		cfg.ADKWorkerAuthMode,
		cfg.ADKWorkerAudience,
	)
	if err != nil {
		slog.Error("worker request authorizer init failed", "err", err)
		os.Exit(1)
	}
	actExecutor := adapter.NewADKWorkerExecutor(cfg.ADKWorkerURL, workerAuthorizer, actRunRecorder, idempotencyGate)

	// ── GCS ──
	gcsClient, err := storage.NewClient(ctx)
	if err != nil {
		slog.Error("gcs client init failed", "err", err)
		os.Exit(1)
	}
	gcsStorage := adapter.NewGCSStorage(gcsClient, cfg.GCSBucket)
	defer gcsStorage.Close()

	// ── Pub/Sub ──
	pubsubClient, err := pubsub.NewClient(ctx, cfg.GCloudProject)
	if err != nil {
		slog.Error("pubsub client init failed", "err", err)
		os.Exit(1)
	}
	defer pubsubClient.Close()
	pubsubPublisher := adapter.NewPubSubPublisher(pubsubClient.Topic(cfg.PubSubTopic))
	defer pubsubPublisher.Stop()

	// ── Firestore (input recorder) ──
	fsClient, err := app.Firestore(ctx)
	if err != nil {
		slog.Error("firestore client init failed", "err", err)
		os.Exit(1)
	}
	inputRecorder := adapter.NewFirestoreInputRecorder(fsClient)
	workspaceRenamer := adapter.NewFirestoreWorkspaceRenamer(fsClient)
	workspaceMemberManager := adapter.NewFirestoreWorkspaceMemberManager(fsClient, authClient)
	defer inputRecorder.Close()

	// ── Usecase layer ──
	uc := usecase.NewRunActUsecase(authVerifier, authzVerifier, sessionValidator, csrfValidator, actExecutor, actRunRecorder, idempotencyGate)
	uploadUC := usecase.NewUploadUsecase(authVerifier, gcsStorage, inputRecorder, pubsubPublisher)
	renameWorkspaceUC := usecase.NewRenameWorkspaceUsecase(authVerifier, workspaceRenamer)
	searchWorkspaceUsersUC := usecase.NewSearchWorkspaceUsersUsecase(authVerifier, workspaceMemberManager)
	addWorkspaceMemberUC := usecase.NewAddWorkspaceMemberUsecase(authVerifier, workspaceMemberManager)
	nodeCandidateResolver := adapter.NewADKWorkerNodeCandidateResolver(cfg.ADKWorkerURL, workerAuthorizer)
	resolveNodeCandidatesUC := usecase.NewResolveNodeCandidatesUsecase(authVerifier, authzVerifier, nodeCandidateResolver)
	actDecisionResolver := adapter.NewADKWorkerActDecisionResolver(cfg.ADKWorkerURL, workerAuthorizer)
	decideActActionUC := usecase.NewDecideActActionUsecase(authVerifier, authzVerifier, actDecisionResolver)

	// ── Handler layer ──
	h := handler.NewRunActHandler(uc)
	sessionBootstrapHandler := handler.NewSessionBootstrapHandler(
		authVerifier,
		sessionIssuer,
		cfg.SIDTTLSeconds,
		cfg.CSRFTTLSeconds,
	)
	uploadHandler := handler.NewUploadHandler(uploadUC)
	workspaceRenameHandler := handler.NewWorkspaceRenameHandler(renameWorkspaceUC)
	workspaceMemberSearchHandler := handler.NewWorkspaceMemberSearchHandler(searchWorkspaceUsersUC)
	workspaceMemberAddHandler := handler.NewWorkspaceMemberAddHandler(addWorkspaceMemberUC)
	resolveNodeCandidatesHandler := handler.NewResolveNodeCandidatesHandler(resolveNodeCandidatesUC)
	decideActActionHandler := handler.NewDecideActActionHandler(decideActActionUC)

	mux := http.NewServeMux()
	path, connectHandler := actv1connect.NewActServiceHandler(h)
	mux.Handle(path, connectHandler)
	mux.Handle("/auth/session/bootstrap", sessionBootstrapHandler)
	mux.Handle("/api/upload", uploadHandler)
	mux.Handle("/api/workspace/rename", workspaceRenameHandler)
	mux.Handle("/api/workspace/members/search", workspaceMemberSearchHandler)
	mux.Handle("/api/workspace/members/add", workspaceMemberAddHandler)
	mux.Handle("/api/resolve-node-candidates", resolveNodeCandidatesHandler)
	mux.Handle("/api/decide-act-action", decideActActionHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: withCORS(h2c.NewHandler(mux, &http2.Server{}), cfg.AllowedOrigins),
	}

	slog.Info("act-api listening", "addr", srv.Addr, "adk_worker_url", cfg.ADKWorkerURL)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("server exited", "err", err)
		os.Exit(1)
	}
}

func withCORS(next http.Handler, allowedOrigins []string) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[origin] = struct{}{}
	}

	isAllowed := func(origin string) bool {
		_, ok := allowed[origin]
		return ok
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if isAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, Connect-Protocol-Version, Connect-Timeout-Ms")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}

		if r.Method == http.MethodOptions {
			if !isAllowed(origin) {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

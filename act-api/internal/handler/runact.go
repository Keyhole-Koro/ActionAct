package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	firebaseauth "firebase.google.com/go/v4/auth"
	"connectrpc.com/connect"
	"github.com/redis/go-redis/v9"

	actv1 "act-api/gen/act/v1"
	"act-api/gen/act/v1/actv1connect"
)

// Config はハンドラの依存を保持する。
type Config struct {
	FirebaseAuth      *firebaseauth.Client
	Redis             *redis.Client
	ADKWorkerURL      string
	SIDStrict         bool
	SIDReqTTL         time.Duration
	SIDLockTTL        time.Duration
}

// RunActHandler は ActService.RunAct を実装する。
type RunActHandler struct {
	actv1connect.UnimplementedActServiceHandler
	cfg Config
}

func NewRunActHandler(cfg Config) *RunActHandler {
	return &RunActHandler{cfg: cfg}
}

// RunAct implements ActServiceHandler.
func (h *RunActHandler) RunAct(
	ctx context.Context,
	req *connect.Request[actv1.RunActRequest],
	stream *connect.ServerStream[actv1.RunActEvent],
) error {
	traceID := newTraceID()
	log := slog.With("trace_id", traceID, "request_id", req.Msg.GetRequestId())

	// 1. AUTHN: Verify Firebase ID token
	tokenUID, err := h.verifyFirebaseToken(ctx, req.Header().Get("Authorization"))
	if err != nil {
		log.Warn("AUTHN failed", "err", err)
		return streamError(stream, "UNAUTHENTICATED", "authentication failed", false, "AUTHN", traceID, 0)
	}

	// 2. SID_VALIDATE: validate sid cookie via Redis
	sid := cookieValue(req.Header(), "sid")
	if err := h.validateSID(ctx, tokenUID, sid); err != nil {
		log.Warn("SID_VALIDATE failed", "err", err, "uid", tokenUID)
		retryable := !errors.Is(err, errSIDInvalid)
		return streamError(stream, "UNAUTHENTICATED", "session invalid", retryable, "SID_VALIDATE", traceID, 0)
	}

	// 3. CSRF_VALIDATE: Double Submit check
	csrfCookie := cookieValue(req.Header(), "csrf_token")
	csrfHeader := req.Header().Get("X-CSRF-Token")
	if csrfCookie == "" || csrfCookie != csrfHeader {
		log.Warn("CSRF_VALIDATE failed", "uid", tokenUID)
		return streamError(stream, "PERMISSION_DENIED", "csrf validation failed", false, "CSRF_VALIDATE", traceID, 0)
	}

	// 4. AUTHN: uid claim consistency check (uid フィールドは deprecated 互換用)
	if reqUID := req.Msg.GetUid(); reqUID != "" && reqUID != tokenUID {
		log.Warn("AUTHN uid mismatch", "token_uid", tokenUID, "req_uid", reqUID)
		return streamError(stream, "UNAUTHENTICATED", "uid mismatch", false, "AUTHN", traceID, 0)
	}

	// 5. VALIDATE_REQUEST: required fields
	if req.Msg.GetTopicId() == "" {
		return streamError(stream, "INVALID_ARGUMENT", "topic_id is required", false, "VALIDATE_REQUEST", traceID, 0)
	}
	if req.Msg.GetWorkspaceId() == "" {
		return streamError(stream, "INVALID_ARGUMENT", "workspace_id is required", false, "VALIDATE_REQUEST", traceID, 0)
	}
	if req.Msg.GetRequestId() == "" {
		return streamError(stream, "INVALID_ARGUMENT", "request_id is required", false, "VALIDATE_REQUEST", traceID, 0)
	}
	if req.Msg.GetUserMessage() == "" {
		return streamError(stream, "INVALID_ARGUMENT", "user_message is required", false, "VALIDATE_REQUEST", traceID, 0)
	}

	// TODO: AUTHZ — workspace membership + topic access (Firestore lookup)
	// TODO: Idempotency — dedup on (tokenUID, workspaceID, requestID) via Redis

	log.Info("RunAct started",
		"topic_id", req.Msg.GetTopicId(),
		"workspace_id", req.Msg.GetWorkspaceId(),
		"uid", tokenUID,
		"act_type", req.Msg.GetActType(),
	)

	// ADK Worker 転送（stub: 直接レスポンスを返す）
	// TODO: h.callADKWorker(ctx, req.Msg, stream)
	if err := stream.Send(&actv1.RunActEvent{
		Event: &actv1.RunActEvent_PatchOps{
			PatchOps: &actv1.PatchOps{
				Ops: []*actv1.PatchOp{
					{Op: "upsert", NodeId: "root", Content: req.Msg.GetUserMessage()},
				},
			},
		},
	}); err != nil {
		return err
	}

	return stream.Send(&actv1.RunActEvent{
		Event: &actv1.RunActEvent_Terminal{
			Terminal: &actv1.Terminal{Done: true},
		},
	})
}

// verifyFirebaseToken は Authorization: Bearer を検証し uid を返す。
// FIREBASE_AUTH_EMULATOR_HOST が設定されていればエミュレーターを使う。
func (h *RunActHandler) verifyFirebaseToken(ctx context.Context, authHeader string) (string, error) {
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", fmt.Errorf("missing Bearer token")
	}
	idToken := strings.TrimPrefix(authHeader, "Bearer ")
	token, err := h.cfg.FirebaseAuth.VerifyIDToken(ctx, idToken)
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}
	// 認証プロバイダが google.com であることを強制する
	if token.Firebase.SignInProvider != "google.com" {
		return "", fmt.Errorf("unsupported sign_in_provider: %q", token.Firebase.SignInProvider)
	}
	return token.UID, nil
}

var errSIDInvalid = errors.New("sid invalid or not found")

// validateSID は sid Cookie を Redis で検証する。
// sid が空かつ SIDStrict=false の場合はスキップ。
func (h *RunActHandler) validateSID(ctx context.Context, uid, sid string) error {
	if sid == "" {
		if h.cfg.SIDStrict {
			return errSIDInvalid
		}
		return nil
	}
	val, err := h.cfg.Redis.Get(ctx, "sid:"+sid).Result()
	if errors.Is(err, redis.Nil) {
		return errSIDInvalid
	}
	if err != nil {
		return fmt.Errorf("redis unavailable: %w", err)
	}
	if val != uid {
		return errSIDInvalid
	}
	return nil
}

// streamError は Terminal.Error を送出してから Connect エラーを返す。
func streamError(
	stream *connect.ServerStream[actv1.RunActEvent],
	code string,
	msg string,
	retryable bool,
	stage string,
	traceID string,
	retryAfterMs int64,
) error {
	_ = stream.Send(&actv1.RunActEvent{
		Event: &actv1.RunActEvent_Terminal{
			Terminal: &actv1.Terminal{
				Error: &actv1.ErrorInfo{
					Code:         code,
					Message:      msg,
					Retryable:    retryable,
					Stage:        stage,
					TraceId:      traceID,
					RetryAfterMs: retryAfterMs,
				},
			},
		},
	})
	return connect.NewError(connectCode(code), fmt.Errorf("%s: %s", stage, msg))
}

func connectCode(code string) connect.Code {
	switch code {
	case "UNAUTHENTICATED":
		return connect.CodeUnauthenticated
	case "PERMISSION_DENIED":
		return connect.CodePermissionDenied
	case "INVALID_ARGUMENT":
		return connect.CodeInvalidArgument
	case "UNAVAILABLE":
		return connect.CodeUnavailable
	case "ALREADY_EXISTS":
		return connect.CodeAlreadyExists
	case "DEADLINE_EXCEEDED":
		return connect.CodeDeadlineExceeded
	default:
		return connect.CodeInternal
	}
}

// cookieValue は HTTP ヘッダーから Cookie 値を取り出す。
func cookieValue(header http.Header, name string) string {
	for _, line := range header["Cookie"] {
		for _, part := range strings.Split(line, ";") {
			part = strings.TrimSpace(part)
			kv := strings.SplitN(part, "=", 2)
			if len(kv) == 2 && strings.TrimSpace(kv[0]) == name {
				return strings.TrimSpace(kv[1])
			}
		}
	}
	return ""
}

func newTraceID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

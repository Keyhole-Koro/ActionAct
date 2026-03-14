package usecase

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
)

// RunActUsecase orchestrates the RunAct pipeline:
// Auth → SID → CSRF → Validate → Execute.
type RunActUsecase struct {
	auth    domain.AuthVerifier
	session domain.SessionValidator
	csrf    domain.CSRFValidator
	exec    domain.ActExecutor
}

func NewRunActUsecase(
	auth domain.AuthVerifier,
	session domain.SessionValidator,
	csrf domain.CSRFValidator,
	exec domain.ActExecutor,
) *RunActUsecase {
	return &RunActUsecase{
		auth:    auth,
		session: session,
		csrf:    csrf,
		exec:    exec,
	}
}

// RequestContext carries extracted HTTP-level values into the usecase.
type RequestContext struct {
	AuthHeader  string
	SIDCookie   string
	CSRFCookie  string
	CSRFHeader  string
}

// Execute runs the full pipeline and returns a *domain.StageError on failure.
func (uc *RunActUsecase) Execute(
	ctx context.Context,
	reqCtx RequestContext,
	msg *actv1.RunActRequest,
	stream *connect.ServerStream[actv1.RunActEvent],
	traceID string,
) error {
	log := slog.With("trace_id", traceID, "request_id", msg.GetRequestId())

	// 1. AUTHN
	uid, err := uc.auth.VerifyToken(ctx, reqCtx.AuthHeader)
	if err != nil {
		log.Warn("AUTHN failed", "err", err)
		return &domain.StageError{Stage: "AUTHN", Err: domain.ErrUnauthenticated, Retryable: false}
	}

	// 2. SID_VALIDATE
	if err := uc.session.ValidateSID(ctx, uid, reqCtx.SIDCookie); err != nil {
		log.Warn("SID_VALIDATE failed", "err", err, "uid", uid)
		retryable := !errors.Is(err, domain.ErrSessionInvalid)
		return &domain.StageError{Stage: "SID_VALIDATE", Err: domain.ErrUnauthenticated, Retryable: retryable}
	}

	// 3. CSRF_VALIDATE
	if err := uc.csrf.Validate(reqCtx.CSRFCookie, reqCtx.CSRFHeader); err != nil {
		log.Warn("CSRF_VALIDATE failed", "uid", uid)
		return &domain.StageError{Stage: "CSRF_VALIDATE", Err: domain.ErrPermissionDenied, Retryable: false}
	}

	// 4. UID consistency (deprecated body field)
	if reqUID := msg.GetUid(); reqUID != "" && reqUID != uid {
		log.Warn("AUTHN uid mismatch", "token_uid", uid, "req_uid", reqUID)
		return &domain.StageError{Stage: "AUTHN", Err: domain.ErrUIDMismatch, Retryable: false}
	}

	// 5. VALIDATE_REQUEST
	if err := validateRequest(msg); err != nil {
		return err
	}

	// TODO: AUTHZ — workspace membership + topic access
	// TODO: Idempotency — dedup on (uid, workspaceID, requestID) via Redis

	log.Info("RunAct started",
		"topic_id", msg.GetTopicId(),
		"workspace_id", msg.GetWorkspaceId(),
		"uid", uid,
		"act_type", msg.GetActType(),
	)

	// 6. EXECUTE
	input := domain.RunActInput{
		UID:         uid,
		TraceID:     traceID,
		RequestID:   msg.GetRequestId(),
		TopicID:     msg.GetTopicId(),
		WorkspaceID: msg.GetWorkspaceId(),
		UserMessage: msg.GetUserMessage(),
		ActType:     msg.GetActType(),
		AnchorID:    msg.GetAnchorNodeId(),
		ContextIDs:  msg.GetContextNodeIds(),
	}
	return uc.exec.Execute(ctx, input, stream)
}

func validateRequest(msg *actv1.RunActRequest) error {
	checks := []struct {
		field string
		value string
	}{
		{"topic_id", msg.GetTopicId()},
		{"workspace_id", msg.GetWorkspaceId()},
		{"request_id", msg.GetRequestId()},
		{"user_message", msg.GetUserMessage()},
	}
	for _, c := range checks {
		if c.value == "" {
			return &domain.StageError{
				Stage:     "VALIDATE_REQUEST",
				Err:       fmt.Errorf("%w: %s is required", domain.ErrInvalidArgument, c.field),
				Retryable: false,
			}
		}
	}
	return nil
}

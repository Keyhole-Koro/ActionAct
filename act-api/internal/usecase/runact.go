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
	authz   domain.AuthzVerifier
	session domain.SessionValidator
	csrf    domain.CSRFValidator
	exec    domain.ActExecutor
	runs    domain.ActRunRecorder
	idem    domain.IdempotencyGate
}

func NewRunActUsecase(
	auth domain.AuthVerifier,
	authz domain.AuthzVerifier,
	session domain.SessionValidator,
	csrf domain.CSRFValidator,
	exec domain.ActExecutor,
	runs domain.ActRunRecorder,
	idem domain.IdempotencyGate,
) *RunActUsecase {
	return &RunActUsecase{
		auth:    auth,
		authz:   authz,
		session: session,
		csrf:    csrf,
		exec:    exec,
		runs:    runs,
		idem:    idem,
	}
}

// RequestContext carries extracted HTTP-level values into the usecase.
type RequestContext struct {
	AuthHeader string
	SIDCookie  string
	CSRFCookie string
	CSRFHeader string
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

	// 5. AUTHZ — workspace membership + topic access
	if uc.authz != nil {
		if err := uc.authz.AuthorizeRunAct(ctx, uid, msg.GetWorkspaceId(), msg.GetTopicId()); err != nil {
			log.Warn("AUTHZ failed", "err", err, "uid", uid, "workspace_id", msg.GetWorkspaceId(), "topic_id", msg.GetTopicId())
			retryable := errors.Is(err, domain.ErrUnavailable)
			mappedErr := domain.ErrPermissionDenied
			if retryable {
				mappedErr = domain.ErrUnavailable
			}
			return &domain.StageError{
				Stage:     "AUTHZ",
				Err:       mappedErr,
				Retryable: retryable,
			}
		}
	}

	// 6. Idempotency — dedup on (uid, workspaceID, requestID) via Redis
	if uc.idem != nil {
		result, err := uc.idem.Begin(ctx, uid, msg.GetWorkspaceId(), msg.GetRequestId())
		if err != nil {
			log.Warn("IDEMPOTENCY_CHECK failed", "err", err)
			return &domain.StageError{
				Stage:     "IDEMPOTENCY_CHECK",
				Err:       domain.ErrUnavailable,
				Retryable: true,
			}
		}
		switch result.Status {
		case domain.IdempotencyInFlight:
			return &domain.StageError{
				Stage:        "IDEMPOTENCY_CHECK",
				Err:          domain.ErrAlreadyExists,
				Retryable:    true,
				RetryAfterMs: result.RetryAfterMs,
			}
		case domain.IdempotencyDone:
			if stream != nil && result.Terminal != nil {
				if err := stream.Send(&actv1.RunActEvent{
					Event: &actv1.RunActEvent_Terminal{Terminal: result.Terminal},
				}); err != nil {
					return err
				}
			}
			return nil
		}
	}

	log.Info("RunAct started",
		"topic_id", msg.GetTopicId(),
		"workspace_id", msg.GetWorkspaceId(),
		"uid", uid,
		"act_type", msg.GetActType(),
	)

	var userMedia []domain.MediaData
	for _, m := range msg.GetUserMedia() {
		userMedia = append(userMedia, domain.MediaData{
			MimeType: m.GetMimeType(),
			Data:     m.GetData(),
		})
	}

	selectedNodeContexts := make([]domain.SelectedNodeContext, 0, len(msg.GetSelectedNodeContexts()))
	for _, ctx := range msg.GetSelectedNodeContexts() {
		selectedNodeContexts = append(selectedNodeContexts, domain.SelectedNodeContext{
			NodeID:         ctx.GetNodeId(),
			Label:          ctx.GetLabel(),
			Kind:           ctx.GetKind(),
			ContextSummary: ctx.GetContextSummary(),
			ContentMD:      ctx.GetContentMd(),
			ThoughtMD:      ctx.GetThoughtMd(),
			DetailHTML:     ctx.GetDetailHtml(),
		})
	}

	// 6. EXECUTE
	input := domain.RunActInput{
		UID:                  uid,
		TraceID:              traceID,
		RequestID:            msg.GetRequestId(),
		TopicID:              msg.GetTopicId(),
		WorkspaceID:          msg.GetWorkspaceId(),
		UserMessage:          msg.GetUserMessage(),
		UserMedia:            userMedia,
		ActType:              msg.GetActType().String(),
		AnchorID:             msg.GetAnchorNodeId(),
		ContextIDs:           msg.GetContextNodeIds(),
		SelectedNodeContexts: selectedNodeContexts,
	}

	if uc.runs != nil {
		if err := uc.runs.Start(ctx, input); err != nil {
			log.Warn("actRuns start failed", "err", err)
		}
	}
	err = uc.exec.Execute(ctx, input, stream)
	if err != nil && uc.idem != nil {
		if releaseErr := uc.idem.Release(ctx, uid, msg.GetWorkspaceId(), msg.GetRequestId()); releaseErr != nil {
			log.Warn("idempotency release failed", "err", releaseErr)
		}
	}
	return err
}

func validateRequest(msg *actv1.RunActRequest) error {
	checks := []struct {
		field string
		value string
	}{
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

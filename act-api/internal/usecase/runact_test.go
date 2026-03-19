package usecase_test

import (
	"context"
	"errors"
	"testing"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
	"act-api/internal/usecase"
)

// ── Mock adapters ──

type mockAuth struct {
	uid string
	err error
}

func (m *mockAuth) VerifyToken(ctx context.Context, authHeader string) (string, error) {
	return m.uid, m.err
}

type mockSession struct {
	err error
}

func (m *mockSession) ValidateSID(ctx context.Context, uid, sid string) error {
	return m.err
}

type mockCSRF struct {
	err error
}

func (m *mockCSRF) Validate(cookieValue, headerValue string) error {
	return m.err
}

type mockAuthz struct {
	err error
}

func (m *mockAuthz) AuthorizeRunAct(ctx context.Context, uid, workspaceID, topicID string) error {
	return m.err
}

type mockExecutor struct {
	called bool
	err    error
}

func (m *mockExecutor) Execute(
	ctx context.Context,
	input domain.RunActInput,
	stream *connect.ServerStream[actv1.RunActEvent],
) error {
	m.called = true
	return m.err
}

type mockActRunRecorder struct {
	startCalled bool
}

func (m *mockActRunRecorder) Start(ctx context.Context, input domain.RunActInput) error {
	m.startCalled = true
	return nil
}

func (m *mockActRunRecorder) AppendEvent(ctx context.Context, input domain.RunActInput, seq int, evt *actv1.RunActEvent) error {
	return nil
}

func (m *mockActRunRecorder) Finish(ctx context.Context, input domain.RunActInput, status string, terminal *actv1.Terminal) error {
	return nil
}

type mockIdempotencyGate struct {
	result        domain.IdempotencyResult
	err           error
	beginCalled   bool
	releaseCalled bool
}

func (m *mockIdempotencyGate) Begin(ctx context.Context, uid, workspaceID, requestID string) (domain.IdempotencyResult, error) {
	m.beginCalled = true
	return m.result, m.err
}

func (m *mockIdempotencyGate) Complete(ctx context.Context, uid, workspaceID, requestID string, terminal *actv1.Terminal) error {
	return nil
}

func (m *mockIdempotencyGate) Release(ctx context.Context, uid, workspaceID, requestID string) error {
	m.releaseCalled = true
	return nil
}

// ── Tests ──

func newTestMsg() *actv1.RunActRequest {
	return &actv1.RunActRequest{
		TopicId:     "topic-1",
		WorkspaceId: "ws-1",
		RequestId:   "req-1",
		UserMessage: "hello",
		ActType:     actv1.ActType_ACT_TYPE_EXPLORE,
	}
}

func TestRunActUsecase_AuthFailure(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{err: domain.ErrUnauthenticated},
		&mockAuthz{},
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{},
	)

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer bad"},
		newTestMsg(),
		nil, // stream unused when auth fails
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "AUTHN" {
		t.Errorf("stage = %q, want AUTHN", stageErr.Stage)
	}
}

func TestRunActUsecase_SessionFailure(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockAuthz{},
		&mockSession{err: domain.ErrSessionInvalid},
		&mockCSRF{},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{},
	)

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		newTestMsg(),
		nil,
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "SID_VALIDATE" {
		t.Errorf("stage = %q, want SID_VALIDATE", stageErr.Stage)
	}
}

func TestRunActUsecase_CSRFFailure(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockAuthz{},
		&mockSession{},
		&mockCSRF{err: domain.ErrCSRFMismatch},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{},
	)

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		newTestMsg(),
		nil,
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "CSRF_VALIDATE" {
		t.Errorf("stage = %q, want CSRF_VALIDATE", stageErr.Stage)
	}
}

func TestRunActUsecase_ValidationFailure_MissingTopicID(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockAuthz{},
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{},
	)

	msg := newTestMsg()
	msg.TopicId = ""

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		msg,
		nil,
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "VALIDATE_REQUEST" {
		t.Errorf("stage = %q, want VALIDATE_REQUEST", stageErr.Stage)
	}
}

func TestRunActUsecase_UIDMismatch(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "real-uid"},
		&mockAuthz{},
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{},
	)

	msg := newTestMsg()
	msg.Uid = "different-uid"

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		msg,
		nil,
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "AUTHN" {
		t.Errorf("stage = %q, want AUTHN", stageErr.Stage)
	}
	if !errors.Is(stageErr.Err, domain.ErrUIDMismatch) {
		t.Errorf("err = %v, want ErrUIDMismatch", stageErr.Err)
	}
}

func TestRunActUsecase_HappyPath_CallsExecutor(t *testing.T) {
	exec := &mockExecutor{}
	recorder := &mockActRunRecorder{}
	idem := &mockIdempotencyGate{}
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockAuthz{},
		&mockSession{},
		&mockCSRF{},
		exec,
		recorder,
		idem,
	)

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		newTestMsg(),
		nil, // stream is passed through to executor
		"trace-1",
	)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !exec.called {
		t.Error("expected executor to be called")
	}
	if !recorder.startCalled {
		t.Error("expected act run recorder to start")
	}
	if !idem.beginCalled {
		t.Error("expected idempotency begin to be called")
	}
}

func TestRunActUsecase_IdempotencyInFlight(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockAuthz{},
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{result: domain.IdempotencyResult{
			Status:       domain.IdempotencyInFlight,
			RetryAfterMs: 3000,
		}},
	)

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		newTestMsg(),
		nil,
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "IDEMPOTENCY_CHECK" {
		t.Errorf("stage = %q, want IDEMPOTENCY_CHECK", stageErr.Stage)
	}
	if !errors.Is(stageErr.Err, domain.ErrAlreadyExists) {
		t.Errorf("err = %v, want ErrAlreadyExists", stageErr.Err)
	}
	if stageErr.RetryAfterMs != 3000 {
		t.Errorf("retryAfterMs = %d, want 3000", stageErr.RetryAfterMs)
	}
}

func TestRunActUsecase_AuthzFailure(t *testing.T) {
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockAuthz{err: domain.ErrPermissionDenied},
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
		&mockActRunRecorder{},
		&mockIdempotencyGate{},
	)

	err := uc.Execute(
		context.Background(),
		usecase.RequestContext{AuthHeader: "Bearer ok"},
		newTestMsg(),
		nil,
		"trace-1",
	)

	var stageErr *domain.StageError
	if !errors.As(err, &stageErr) {
		t.Fatalf("expected StageError, got %T: %v", err, err)
	}
	if stageErr.Stage != "AUTHZ" {
		t.Errorf("stage = %q, want AUTHZ", stageErr.Stage)
	}
	if !errors.Is(stageErr.Err, domain.ErrPermissionDenied) {
		t.Errorf("err = %v, want ErrPermissionDenied", stageErr.Err)
	}
}

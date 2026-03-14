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
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
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
		&mockSession{err: domain.ErrSessionInvalid},
		&mockCSRF{},
		&mockExecutor{},
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
		&mockSession{},
		&mockCSRF{err: domain.ErrCSRFMismatch},
		&mockExecutor{},
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
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
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
		&mockSession{},
		&mockCSRF{},
		&mockExecutor{},
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
	uc := usecase.NewRunActUsecase(
		&mockAuth{uid: "user-1"},
		&mockSession{},
		&mockCSRF{},
		exec,
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
}

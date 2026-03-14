package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"act-api/internal/domain"
	"act-api/internal/handler"
)

type stubBootstrapAuth struct {
	uid string
	err error
}

func (s *stubBootstrapAuth) VerifyToken(ctx context.Context, authHeader string) (string, error) {
	return s.uid, s.err
}

type stubBootstrapIssuer struct {
	sid  string
	csrf string
	err  error
}

func (s *stubBootstrapIssuer) Issue(ctx context.Context, uid string) (string, string, error) {
	return s.sid, s.csrf, s.err
}

func TestSessionBootstrapHandler_SetsCookies(t *testing.T) {
	h := handler.NewSessionBootstrapHandler(
		&stubBootstrapAuth{uid: "user-1"},
		&stubBootstrapIssuer{sid: "sid-1", csrf: "csrf-1"},
		86400,
		86400,
	)

	req := httptest.NewRequest(http.MethodPost, "/auth/session/bootstrap", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	cookies := rec.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("cookie count = %d, want 2", len(cookies))
	}
}

func TestSessionBootstrapHandler_Unauthorized(t *testing.T) {
	h := handler.NewSessionBootstrapHandler(
		&stubBootstrapAuth{err: domain.ErrUnauthenticated},
		&stubBootstrapIssuer{},
		86400,
		86400,
	)

	req := httptest.NewRequest(http.MethodPost, "/auth/session/bootstrap", nil)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSessionBootstrapHandler_IssueFailure(t *testing.T) {
	h := handler.NewSessionBootstrapHandler(
		&stubBootstrapAuth{uid: "user-1"},
		&stubBootstrapIssuer{err: errors.New("redis down")},
		86400,
		86400,
	)

	req := httptest.NewRequest(http.MethodPost, "/auth/session/bootstrap", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"act-api/internal/domain"
	"act-api/internal/handler"
)

type stubWorkspaceMemberAddUsecase struct {
	err error
}

func (s *stubWorkspaceMemberAddUsecase) Execute(_ context.Context, _ string, _ string, _ string, _ string) error {
	return s.err
}

func TestWorkspaceMemberAddHandler_OK(t *testing.T) {
	h := handler.NewWorkspaceMemberAddHandler(&stubWorkspaceMemberAddUsecase{})
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/workspace/members/add",
		strings.NewReader(`{"workspace_id":"ws-1","user_id":"u1","role":"editor"}`),
	)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestWorkspaceMemberAddHandler_ErrorMapping(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
	}{
		{name: "unauthenticated", err: domain.ErrUnauthenticated, wantStatus: http.StatusUnauthorized},
		{name: "permission denied", err: domain.ErrPermissionDenied, wantStatus: http.StatusForbidden},
		{name: "invalid argument", err: domain.ErrInvalidArgument, wantStatus: http.StatusBadRequest},
		{name: "unavailable", err: domain.ErrUnavailable, wantStatus: http.StatusServiceUnavailable},
		{name: "unknown", err: errors.New("boom"), wantStatus: http.StatusInternalServerError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := handler.NewWorkspaceMemberAddHandler(&stubWorkspaceMemberAddUsecase{err: tc.err})
			req := httptest.NewRequest(
				http.MethodPost,
				"/api/workspace/members/add",
				strings.NewReader(`{"workspace_id":"ws-1","user_id":"u1","role":"editor"}`),
			)
			rec := httptest.NewRecorder()

			h.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

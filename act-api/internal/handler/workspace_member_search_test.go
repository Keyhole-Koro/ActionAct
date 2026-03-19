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

type stubWorkspaceMemberSearchUsecase struct {
	users []domain.WorkspaceUser
	err   error
}

func (s *stubWorkspaceMemberSearchUsecase) Execute(_ context.Context, _ string, _ string, _ string, _ int) ([]domain.WorkspaceUser, error) {
	return s.users, s.err
}

func TestWorkspaceMemberSearchHandler_OK(t *testing.T) {
	h := handler.NewWorkspaceMemberSearchHandler(&stubWorkspaceMemberSearchUsecase{
		users: []domain.WorkspaceUser{{UID: "u1", Email: "u1@example.com", DisplayName: "U1"}},
	})
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/workspace/members/search",
		strings.NewReader(`{"workspace_id":"ws-1","query":"u1"}`),
	)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestWorkspaceMemberSearchHandler_ErrorMapping(t *testing.T) {
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
			h := handler.NewWorkspaceMemberSearchHandler(&stubWorkspaceMemberSearchUsecase{err: tc.err})
			req := httptest.NewRequest(
				http.MethodPost,
				"/api/workspace/members/search",
				strings.NewReader(`{"workspace_id":"ws-1","query":"u1"}`),
			)
			rec := httptest.NewRecorder()

			h.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

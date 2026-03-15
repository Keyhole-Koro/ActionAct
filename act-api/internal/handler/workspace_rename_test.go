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

type stubWorkspaceRenameUsecase struct {
	err error
}

func (s *stubWorkspaceRenameUsecase) Execute(_ context.Context, _ string, _ string, _ string) error {
	return s.err
}

func TestWorkspaceRenameHandler_OK(t *testing.T) {
	h := handler.NewWorkspaceRenameHandler(&stubWorkspaceRenameUsecase{})
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/workspace/rename",
		strings.NewReader(`{"workspace_id":"ws-1","name":"Team Alpha"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestWorkspaceRenameHandler_MethodNotAllowed(t *testing.T) {
	h := handler.NewWorkspaceRenameHandler(&stubWorkspaceRenameUsecase{})
	req := httptest.NewRequest(http.MethodGet, "/api/workspace/rename", nil)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestWorkspaceRenameHandler_InvalidJSON(t *testing.T) {
	h := handler.NewWorkspaceRenameHandler(&stubWorkspaceRenameUsecase{})
	req := httptest.NewRequest(http.MethodPost, "/api/workspace/rename", strings.NewReader(`{"workspace_id":`))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestWorkspaceRenameHandler_ErrorMapping(t *testing.T) {
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
			h := handler.NewWorkspaceRenameHandler(&stubWorkspaceRenameUsecase{err: tc.err})
			req := httptest.NewRequest(
				http.MethodPost,
				"/api/workspace/rename",
				strings.NewReader(`{"workspace_id":"ws-1","name":"Team Alpha"}`),
			)
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			h.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}

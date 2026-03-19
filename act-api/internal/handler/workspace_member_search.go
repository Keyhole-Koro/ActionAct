package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"act-api/internal/domain"
)

type workspaceMemberSearchRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Query       string `json:"query"`
	Limit       int    `json:"limit"`
}

type workspaceMemberSearchExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID, query string, limit int) ([]domain.WorkspaceUser, error)
}

type WorkspaceMemberSearchHandler struct {
	uc workspaceMemberSearchExecutor
}

func NewWorkspaceMemberSearchHandler(uc workspaceMemberSearchExecutor) *WorkspaceMemberSearchHandler {
	return &WorkspaceMemberSearchHandler{uc: uc}
}

func (h *WorkspaceMemberSearchHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceMemberSearchRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	users, err := h.uc.Execute(
		r.Context(),
		r.Header.Get("Authorization"),
		req.WorkspaceID,
		req.Query,
		req.Limit,
	)
	if err != nil {
		slog.Warn("workspace member search failed", "workspace_id", req.WorkspaceID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "workspace member search unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "workspace member search failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"workspace_id": req.WorkspaceID,
		"users":        users,
		"count":        len(users),
	})
}

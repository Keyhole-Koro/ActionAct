package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"act-api/internal/domain"
)

type workspaceRenameRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
}

type workspaceRenameExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID, newName string) error
}

type WorkspaceRenameHandler struct {
	uc workspaceRenameExecutor
}

func NewWorkspaceRenameHandler(uc workspaceRenameExecutor) *WorkspaceRenameHandler {
	return &WorkspaceRenameHandler{uc: uc}
}

func (h *WorkspaceRenameHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceRenameRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	err := h.uc.Execute(
		r.Context(),
		r.Header.Get("Authorization"),
		req.WorkspaceID,
		req.Name,
	)
	if err != nil {
		slog.Warn("workspace rename failed", "workspace_id", req.WorkspaceID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "workspace rename unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "workspace rename failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"workspace_id": req.WorkspaceID,
		"name":         req.Name,
		"status":       "ok",
	})
}

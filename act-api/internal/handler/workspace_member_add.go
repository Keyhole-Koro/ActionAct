package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"act-api/internal/domain"
)

type workspaceMemberAddRequest struct {
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	Role        string `json:"role"`
}

type workspaceMemberAddExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID, targetUID, role string) error
}

type WorkspaceMemberAddHandler struct {
	uc workspaceMemberAddExecutor
}

func NewWorkspaceMemberAddHandler(uc workspaceMemberAddExecutor) *WorkspaceMemberAddHandler {
	return &WorkspaceMemberAddHandler{uc: uc}
}

func (h *WorkspaceMemberAddHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceMemberAddRequest
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
		req.UserID,
		req.Role,
	)
	if err != nil {
		slog.Warn("workspace member add failed", "workspace_id", req.WorkspaceID, "user_id", req.UserID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "workspace member add unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "workspace member add failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"workspace_id": req.WorkspaceID,
		"user_id":      req.UserID,
		"role":         req.Role,
		"status":       "ok",
	})
}

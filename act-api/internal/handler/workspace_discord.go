package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"act-api/internal/domain"
)

type workspaceDiscordInviteRequest struct {
	WorkspaceID string `json:"workspace_id"`
}

type workspaceDiscordConnectRequest struct {
	WorkspaceID string `json:"workspace_id"`
	GuildID     string `json:"guild_id"`
	GuildName   string `json:"guild_name"`
}

type workspaceDiscordInstallSessionRequest struct {
	WorkspaceID string `json:"workspace_id"`
	SessionID   string `json:"session_id,omitempty"`
	GuildID     string `json:"guild_id,omitempty"`
}

type workspaceDiscordInviteExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID string) (string, error)
}

type workspaceDiscordConnectExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID, guildID, guildName string) error
}

type workspaceDiscordCreateInstallSessionExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID string) (*domain.DiscordInstallSession, error)
}

type workspaceDiscordGetInstallSessionExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID, sessionID string) (*domain.DiscordInstallSession, error)
}

type workspaceDiscordConfirmInstallSessionExecutor interface {
	Execute(ctx context.Context, authHeader, workspaceID, sessionID, guildID string) error
}

type WorkspaceDiscordInviteHandler struct {
	uc workspaceDiscordInviteExecutor
}

type WorkspaceDiscordConnectHandler struct {
	uc workspaceDiscordConnectExecutor
}

type WorkspaceDiscordCreateInstallSessionHandler struct {
	uc workspaceDiscordCreateInstallSessionExecutor
}

type WorkspaceDiscordGetInstallSessionHandler struct {
	uc workspaceDiscordGetInstallSessionExecutor
}

type WorkspaceDiscordConfirmInstallSessionHandler struct {
	uc workspaceDiscordConfirmInstallSessionExecutor
}

func NewWorkspaceDiscordInviteHandler(uc workspaceDiscordInviteExecutor) *WorkspaceDiscordInviteHandler {
	return &WorkspaceDiscordInviteHandler{uc: uc}
}

func NewWorkspaceDiscordConnectHandler(uc workspaceDiscordConnectExecutor) *WorkspaceDiscordConnectHandler {
	return &WorkspaceDiscordConnectHandler{uc: uc}
}

func NewWorkspaceDiscordCreateInstallSessionHandler(uc workspaceDiscordCreateInstallSessionExecutor) *WorkspaceDiscordCreateInstallSessionHandler {
	return &WorkspaceDiscordCreateInstallSessionHandler{uc: uc}
}

func NewWorkspaceDiscordGetInstallSessionHandler(uc workspaceDiscordGetInstallSessionExecutor) *WorkspaceDiscordGetInstallSessionHandler {
	return &WorkspaceDiscordGetInstallSessionHandler{uc: uc}
}

func NewWorkspaceDiscordConfirmInstallSessionHandler(uc workspaceDiscordConfirmInstallSessionExecutor) *WorkspaceDiscordConfirmInstallSessionHandler {
	return &WorkspaceDiscordConfirmInstallSessionHandler{uc: uc}
}

func (h *WorkspaceDiscordInviteHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceDiscordInviteRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	inviteURL, err := h.uc.Execute(r.Context(), r.Header.Get("Authorization"), req.WorkspaceID)
	if err != nil {
		slog.Warn("discord invite url failed", "workspace_id", req.WorkspaceID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "discord invite unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "discord invite failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"workspace_id": req.WorkspaceID,
		"invite_url":   inviteURL,
		"status":       "ok",
	})
}

func (h *WorkspaceDiscordConnectHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceDiscordConnectRequest
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
		req.GuildID,
		req.GuildName,
	)
	if err != nil {
		slog.Warn("discord connect failed", "workspace_id", req.WorkspaceID, "guild_id", req.GuildID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrAlreadyExists):
			http.Error(w, err.Error(), http.StatusConflict)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "discord connect unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "discord connect failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"workspace_id": req.WorkspaceID,
		"guild_id":     req.GuildID,
		"guild_name":   req.GuildName,
		"status":       "ok",
	})
}

func (h *WorkspaceDiscordCreateInstallSessionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceDiscordInstallSessionRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	session, err := h.uc.Execute(r.Context(), r.Header.Get("Authorization"), req.WorkspaceID)
	if err != nil {
		slog.Warn("discord install session create failed", "workspace_id", req.WorkspaceID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "discord install session unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "discord install session failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(session)
}

func (h *WorkspaceDiscordGetInstallSessionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceDiscordInstallSessionRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	session, err := h.uc.Execute(r.Context(), r.Header.Get("Authorization"), req.WorkspaceID, req.SessionID)
	if err != nil {
		slog.Warn("discord install session get failed", "workspace_id", req.WorkspaceID, "session_id", req.SessionID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "discord install session unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "discord install session failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(session)
}

func (h *WorkspaceDiscordConfirmInstallSessionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspaceDiscordInstallSessionRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	err := h.uc.Execute(r.Context(), r.Header.Get("Authorization"), req.WorkspaceID, req.SessionID, req.GuildID)
	if err != nil {
		slog.Warn("discord install session confirm failed", "workspace_id", req.WorkspaceID, "session_id", req.SessionID, "guild_id", req.GuildID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrAlreadyExists):
			http.Error(w, err.Error(), http.StatusConflict)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "discord install confirm unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "discord install confirm failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"workspace_id": req.WorkspaceID,
		"session_id":   req.SessionID,
		"guild_id":     req.GuildID,
		"status":       "ok",
	})
}

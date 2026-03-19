package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"act-api/internal/domain"
	"github.com/google/uuid"
)

type resolveNodeCandidatesRequest struct {
	WorkspaceID     string                        `json:"workspace_id"`
	TopicID         string                        `json:"topic_id"`
	UserMessage     string                        `json:"user_message"`
	ActiveNodeID    string                        `json:"active_node_id"`
	SelectedNodeIDs []string                      `json:"selected_node_ids"`
	MaxCandidates   int                           `json:"max_candidates"`
	Nodes           []domain.CandidateVisibleNode `json:"nodes"`
}

type resolveNodeCandidatesExecutor interface {
	Execute(ctx context.Context, authHeader string, input domain.ResolveNodeCandidatesInput) ([]domain.NodeCandidate, error)
}

type ResolveNodeCandidatesHandler struct {
	uc resolveNodeCandidatesExecutor
}

func NewResolveNodeCandidatesHandler(uc resolveNodeCandidatesExecutor) *ResolveNodeCandidatesHandler {
	return &ResolveNodeCandidatesHandler{uc: uc}
}

func (h *ResolveNodeCandidatesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req resolveNodeCandidatesRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	candidates, err := h.uc.Execute(
		r.Context(),
		r.Header.Get("Authorization"),
		domain.ResolveNodeCandidatesInput{
			TraceID:         uuid.NewString(),
			WorkspaceID:     req.WorkspaceID,
			TopicID:         req.TopicID,
			UserMessage:     req.UserMessage,
			ActiveNodeID:    req.ActiveNodeID,
			SelectedNodeIDs: req.SelectedNodeIDs,
			MaxCandidates:   req.MaxCandidates,
			Nodes:           req.Nodes,
		},
	)
	if err != nil {
		slog.Warn("resolve node candidates failed", "workspace_id", req.WorkspaceID, "topic_id", req.TopicID, "err", err)
		switch {
		case errors.Is(err, domain.ErrUnauthenticated):
			http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		case errors.Is(err, domain.ErrPermissionDenied):
			http.Error(w, domain.ErrPermissionDenied.Error(), http.StatusForbidden)
		case errors.Is(err, domain.ErrInvalidArgument):
			http.Error(w, err.Error(), http.StatusBadRequest)
		case errors.Is(err, domain.ErrUnavailable):
			http.Error(w, "candidate resolution unavailable", http.StatusServiceUnavailable)
		default:
			http.Error(w, "candidate resolution failed", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"workspace_id": req.WorkspaceID,
		"topic_id": req.TopicID,
		"candidates": candidates,
		"count": len(candidates),
	})
}

package adapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"act-api/internal/domain"
)

type ADKWorkerNodeCandidateResolver struct {
	workerURL         string
	httpClient        *http.Client
	requestAuthorizer ADKWorkerRequestAuthorizer
}

func NewADKWorkerNodeCandidateResolver(workerURL string, requestAuthorizer ADKWorkerRequestAuthorizer) *ADKWorkerNodeCandidateResolver {
	if requestAuthorizer == nil {
		requestAuthorizer = noopADKWorkerRequestAuthorizer{}
	}

	return &ADKWorkerNodeCandidateResolver{
		workerURL:         workerURL,
		httpClient:        &http.Client{},
		requestAuthorizer: requestAuthorizer,
	}
}

type workerCandidateRequest struct {
	TraceID         string                        `json:"trace_id"`
	UID             string                        `json:"uid"`
	TopicID         string                        `json:"topic_id"`
	WorkspaceID     string                        `json:"workspace_id"`
	UserMessage     string                        `json:"user_message"`
	ActiveNodeID    string                        `json:"active_node_id,omitempty"`
	SelectedNodeIDs []string                      `json:"selected_node_ids,omitempty"`
	MaxCandidates   int                           `json:"max_candidates"`
	Nodes           []domain.CandidateVisibleNode `json:"nodes"`
}

type workerCandidateResponse struct {
	Candidates []domain.NodeCandidate `json:"candidates"`
}

func (r *ADKWorkerNodeCandidateResolver) Resolve(ctx context.Context, input domain.ResolveNodeCandidatesInput) ([]domain.NodeCandidate, error) {
	body, err := json.Marshal(workerCandidateRequest{
		TraceID:         input.TraceID,
		UID:             input.UID,
		TopicID:         input.TopicID,
		WorkspaceID:     input.WorkspaceID,
		UserMessage:     input.UserMessage,
		ActiveNodeID:    input.ActiveNodeID,
		SelectedNodeIDs: input.SelectedNodeIDs,
		MaxCandidates:   input.MaxCandidates,
		Nodes:           input.Nodes,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal candidate request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.workerURL+"/resolve_node_candidates", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build candidate request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if err := r.requestAuthorizer.Authorize(ctx, req); err != nil {
		return nil, fmt.Errorf("%w: add worker authorization: %v", domain.ErrUnavailable, err)
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: candidate worker unreachable: %v", domain.ErrUnavailable, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		text, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("%w: candidate worker returned %d: %s", domain.ErrUnavailable, resp.StatusCode, string(text))
	}

	var payload workerCandidateResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("%w: invalid candidate worker response: %v", domain.ErrUnavailable, err)
	}
	return payload.Candidates, nil
}

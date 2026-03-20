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

type ADKWorkerActDecisionResolver struct {
	workerURL  string
	httpClient *http.Client
}

func NewADKWorkerActDecisionResolver(workerURL string, httpClient *http.Client) *ADKWorkerActDecisionResolver {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	return &ADKWorkerActDecisionResolver{
		workerURL:  workerURL,
		httpClient: httpClient,
	}
}

type workerActDecisionRequest struct {
	TraceID         string                          `json:"trace_id"`
	UID             string                          `json:"uid"`
	TopicID         string                          `json:"topic_id"`
	WorkspaceID     string                          `json:"workspace_id"`
	UserMessage     string                          `json:"user_message"`
	ActiveNodeID    string                          `json:"active_node_id,omitempty"`
	SelectedNodeIDs []string                        `json:"selected_node_ids,omitempty"`
	AvailableTools  []string                        `json:"available_tools,omitempty"`
	Nodes           []domain.ActDecisionVisibleNode `json:"nodes"`
}

func (r *ADKWorkerActDecisionResolver) Resolve(ctx context.Context, input domain.ActDecisionInput) (domain.ActDecisionResult, error) {
	body, err := json.Marshal(workerActDecisionRequest{
		TraceID:         input.TraceID,
		UID:             input.UID,
		TopicID:         input.TopicID,
		WorkspaceID:     input.WorkspaceID,
		UserMessage:     input.UserMessage,
		ActiveNodeID:    input.ActiveNodeID,
		SelectedNodeIDs: input.SelectedNodeIDs,
		AvailableTools:  input.AvailableTools,
		Nodes:           input.Nodes,
	})
	if err != nil {
		return domain.ActDecisionResult{}, fmt.Errorf("marshal act decision request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.workerURL+"/decide_act_action", bytes.NewReader(body))
	if err != nil {
		return domain.ActDecisionResult{}, fmt.Errorf("build act decision request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return domain.ActDecisionResult{}, fmt.Errorf("%w: decision worker unreachable: %v", domain.ErrUnavailable, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		text, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return domain.ActDecisionResult{}, fmt.Errorf("%w: decision worker returned %d: %s", domain.ErrUnavailable, resp.StatusCode, string(text))
	}

	var payload domain.ActDecisionResult
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return domain.ActDecisionResult{}, fmt.Errorf("%w: invalid decision worker response: %v", domain.ErrUnavailable, err)
	}
	return payload, nil
}

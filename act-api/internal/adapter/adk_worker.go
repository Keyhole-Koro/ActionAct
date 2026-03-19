package adapter

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
)

// ADKWorkerExecutor implements domain.ActExecutor by forwarding requests
// to the act-adk-worker service via HTTP and streaming ndjson responses.
type ADKWorkerExecutor struct {
	workerURL  string
	gcsBucket  string // used to construct full gs:// URIs for MediaRef
	httpClient *http.Client
	recorder   domain.ActRunRecorder
	idem       domain.IdempotencyGate
}

func NewADKWorkerExecutor(workerURL string, gcsBucket string, recorder domain.ActRunRecorder, idem domain.IdempotencyGate) *ADKWorkerExecutor {
	return &ADKWorkerExecutor{
		workerURL: workerURL,
		gcsBucket: gcsBucket,
		httpClient: &http.Client{
			Timeout: 5 * time.Minute,
		},
		recorder: recorder,
		idem:     idem,
	}
}

// workerRequest is the JSON body sent to the ADK Worker.
type workerRequest struct {
	TraceID              string                      `json:"trace_id"`
	UID                  string                      `json:"uid"`
	TopicID              string                      `json:"topic_id"`
	WorkspaceID          string                      `json:"workspace_id"`
	RequestID            string                      `json:"request_id"`
	ActType              string                      `json:"act_type"`
	UserMessage          string                      `json:"user_message"`
	UserMedia            []workerMedia               `json:"user_media,omitempty"`
	AnchorNodeID         string                      `json:"anchor_node_id,omitempty"`
	ContextNodeIDs       []string                    `json:"context_node_ids,omitempty"`
	SelectedNodeContexts []workerSelectedNodeContext `json:"selected_node_contexts,omitempty"`
	LLMConfig            *workerLLMConfig            `json:"llm_config,omitempty"`
}

type workerSelectedNodeContext struct {
	NodeID         string `json:"node_id"`
	Label          string `json:"label,omitempty"`
	Kind           string `json:"kind,omitempty"`
	ContextSummary string `json:"context_summary,omitempty"`
	ContentMD      string `json:"content_md,omitempty"`
	ThoughtMD      string `json:"thought_md,omitempty"`
	DetailHTML     string `json:"detail_html,omitempty"`
}

type workerMedia struct {
	MimeType  string `json:"mime_type"`
	GCSUri    string `json:"gcs_uri"`
	SizeBytes int64  `json:"size_bytes,omitempty"`
}

type workerLLMConfig struct {
	Model           string `json:"model,omitempty"`
	EnableGrounding bool   `json:"enable_grounding,omitempty"`
	EnableThinking  bool   `json:"enable_thinking,omitempty"`
}

type workerSourceRef struct {
	ID    string `json:"id"`
	Kind  string `json:"kind,omitempty"`
	Label string `json:"label,omitempty"`
	URI   string `json:"uri,omitempty"`
}

type workerUsedSelectedNodeContext struct {
	NodeID         string `json:"node_id"`
	Label          string `json:"label,omitempty"`
	Kind           string `json:"kind,omitempty"`
	ContextSummary string `json:"context_summary,omitempty"`
	ContentMD      string `json:"content_md,omitempty"`
	ThoughtMD      string `json:"thought_md,omitempty"`
	DetailHTML     string `json:"detail_html,omitempty"`
}

// workerEvent is a single ndjson line from the ADK Worker response.
type workerEvent struct {
	Type                     string                          `json:"type"`
	Ops                      []workerPatch                   `json:"ops,omitempty"`
	Text                     *string                         `json:"text,omitempty"`
	IsThought                *bool                           `json:"is_thought,omitempty"`
	Done                     *bool                           `json:"done,omitempty"`
	Error                    *workerError                    `json:"error,omitempty"`
	UsedContextNodeIDs       []string                        `json:"used_context_node_ids,omitempty"`
	UsedSelectedNodeContexts []workerUsedSelectedNodeContext `json:"used_selected_node_contexts,omitempty"`
	UsedTools                []string                        `json:"used_tools,omitempty"`
	UsedSources              []workerSourceRef               `json:"used_sources,omitempty"`
	ActionTriggers           []workerActionTrigger           `json:"action_triggers,omitempty"`
}

type workerPatch struct {
	Op             string `json:"op"`
	NodeID         string `json:"node_id"`
	Content        string `json:"content"`
	Seq            uint64 `json:"seq,omitempty"`
	ExpectedOffset uint32 `json:"expected_offset,omitempty"`
	Kind           string `json:"kind,omitempty"`
	ParentID       string `json:"parent_id,omitempty"`
	Label          string `json:"label,omitempty"`
}

type workerActionTrigger struct {
	Action      string `json:"action"`
	PayloadJSON string `json:"payload_json"`
}

type workerError struct {
	Code         string `json:"code"`
	Message      string `json:"message"`
	Retryable    bool   `json:"retryable"`
	Stage        string `json:"stage"`
	TraceID      string `json:"trace_id"`
	RetryAfterMs int64  `json:"retry_after_ms"`
}

func (e *ADKWorkerExecutor) Execute(
	ctx context.Context,
	input domain.RunActInput,
	stream *connect.ServerStream[actv1.RunActEvent],
) error {
	log := slog.With("trace_id", input.TraceID, "request_id", input.RequestID)

	var userMedia []workerMedia
	for _, m := range input.UserMediaRefs {
		userMedia = append(userMedia, workerMedia{
			MimeType:  m.MimeType,
			GCSUri:    fmt.Sprintf("gs://%s/%s", e.gcsBucket, m.GCSObjectKey),
			SizeBytes: m.SizeBytes,
		})
	}

	selectedNodeContexts := make([]workerSelectedNodeContext, 0, len(input.SelectedNodeContexts))
	for _, ctx := range input.SelectedNodeContexts {
		selectedNodeContexts = append(selectedNodeContexts, workerSelectedNodeContext{
			NodeID:         ctx.NodeID,
			Label:          ctx.Label,
			Kind:           ctx.Kind,
			ContextSummary: ctx.ContextSummary,
			ContentMD:      ctx.ContentMD,
			ThoughtMD:      ctx.ThoughtMD,
			DetailHTML:     ctx.DetailHTML,
		})
	}

	reqBody := workerRequest{
		TraceID:              input.TraceID,
		UID:                  input.UID,
		TopicID:              input.TopicID,
		WorkspaceID:          input.WorkspaceID,
		RequestID:            input.RequestID,
		ActType:              input.ActType,
		UserMessage:          input.UserMessage,
		UserMedia:            userMedia,
		AnchorNodeID:         input.AnchorID,
		ContextNodeIDs:       input.ContextIDs,
		SelectedNodeContexts: selectedNodeContexts,
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal worker request: %w", err)
	}

	url := e.workerURL + "/run_act"
	log.Info("forwarding to ADK Worker", "url", url)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := e.httpClient.Do(httpReq)
	if err != nil {
		log.Error("ADK Worker request failed", "err", err)
		e.finishWithWorkerError(ctx, input, "UNAVAILABLE", "ADK Worker unreachable: "+err.Error(), true, "GENERATE_WITH_MODEL")
		return sendWorkerError(stream, "UNAVAILABLE", "ADK Worker unreachable: "+err.Error(), true, "GENERATE_WITH_MODEL", input.TraceID)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		log.Error("ADK Worker returned error", "status", resp.StatusCode, "body", string(body))
		e.finishWithWorkerError(ctx, input, "UNAVAILABLE", fmt.Sprintf("ADK Worker returned %d: %s", resp.StatusCode, string(body)), true, "GENERATE_WITH_MODEL")
		return sendWorkerError(stream, "UNAVAILABLE", fmt.Sprintf("ADK Worker returned %d: %s", resp.StatusCode, string(body)), true, "GENERATE_WITH_MODEL", input.TraceID)
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	seq := 0
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var evt workerEvent
		if err := json.Unmarshal(line, &evt); err != nil {
			log.Warn("failed to parse worker event", "err", err, "line", string(line))
			continue
		}

		protoEvt, done, err := toProtoEvent(evt)
		if err != nil {
			log.Warn("failed to convert worker event", "err", err)
			continue
		}

		if err := stream.Send(protoEvt); err != nil {
			e.finishWithWorkerError(ctx, input, "INTERNAL", "send to client: "+err.Error(), false, "EMIT_STREAM")
			return fmt.Errorf("send to client: %w", err)
		}
		seq++
		e.appendEvent(ctx, input, seq, protoEvt)

		if done {
			e.finishFromTerminal(ctx, input, protoEvt.GetTerminal())
			return nil
		}
	}

	if err := scanner.Err(); err != nil {
		log.Error("reading worker response stream", "err", err)
		e.finishWithWorkerError(ctx, input, "UNAVAILABLE", "stream read error: "+err.Error(), true, "EMIT_STREAM")
		return sendWorkerError(stream, "UNAVAILABLE", "stream read error: "+err.Error(), true, "EMIT_STREAM", input.TraceID)
	}

	doneEvt := &actv1.RunActEvent{Event: &actv1.RunActEvent_Terminal{Terminal: &actv1.Terminal{Done: true}}}
	if err := stream.Send(doneEvt); err != nil {
		e.finishWithWorkerError(ctx, input, "INTERNAL", "send to client: "+err.Error(), false, "EMIT_STREAM")
		return err
	}
	seq++
	e.appendEvent(ctx, input, seq, doneEvt)
	e.finishFromTerminal(ctx, input, doneEvt.GetTerminal())
	return nil
}

// toProtoEvent converts a worker ndjson event to a proto RunActEvent.
func toProtoEvent(evt workerEvent) (*actv1.RunActEvent, bool, error) {
	switch evt.Type {
	case "patch_ops":
		ops := make([]*actv1.PatchOp, len(evt.Ops))
		for i, op := range evt.Ops {
			ops[i] = &actv1.PatchOp{
				Op:             op.Op,
				NodeId:         op.NodeID,
				Content:        op.Content,
				Seq:            op.Seq,
				ExpectedOffset: op.ExpectedOffset,
				Kind:           op.Kind,
				ParentId:       op.ParentID,
				Label:          op.Label,
			}
		}
		return &actv1.RunActEvent{Event: &actv1.RunActEvent_PatchOps{PatchOps: &actv1.PatchOps{Ops: ops}}}, false, nil

	case "text_delta":
		text := ""
		if evt.Text != nil {
			text = *evt.Text
		}
		isThought := false
		if evt.IsThought != nil {
			isThought = *evt.IsThought
		}
		return &actv1.RunActEvent{Event: &actv1.RunActEvent_TextDelta{TextDelta: &actv1.TextDelta{Text: text}}, IsThought: isThought}, false, nil

	case "terminal":
		t := &actv1.Terminal{}
		if evt.Done != nil && *evt.Done {
			t.Done = true
		}
		if evt.Error != nil {
			t.Error = &actv1.ErrorInfo{Code: evt.Error.Code, Message: evt.Error.Message, Retryable: evt.Error.Retryable, Stage: evt.Error.Stage, TraceId: evt.Error.TraceID, RetryAfterMs: evt.Error.RetryAfterMs}
		}
		if len(evt.UsedContextNodeIDs) > 0 {
			t.UsedContextNodeIds = evt.UsedContextNodeIDs
		}
		if len(evt.UsedSelectedNodeContexts) > 0 {
			mapped := make([]*actv1.SelectedNodeContext, 0, len(evt.UsedSelectedNodeContexts))
			for _, ctx := range evt.UsedSelectedNodeContexts {
				mapped = append(mapped, &actv1.SelectedNodeContext{NodeId: ctx.NodeID, Label: ctx.Label, Kind: ctx.Kind, ContextSummary: ctx.ContextSummary, ContentMd: ctx.ContentMD, ThoughtMd: ctx.ThoughtMD, DetailHtml: ctx.DetailHTML})
			}
			t.UsedSelectedNodeContexts = mapped
		}
		if len(evt.UsedTools) > 0 {
			t.UsedTools = evt.UsedTools
		}
		if len(evt.UsedSources) > 0 {
			mapped := make([]*actv1.SourceRef, 0, len(evt.UsedSources))
			for _, source := range evt.UsedSources {
				mapped = append(mapped, &actv1.SourceRef{Id: source.ID, Kind: source.Kind, Label: source.Label, Uri: source.URI})
			}
			t.UsedSources = mapped
		}
		return &actv1.RunActEvent{Event: &actv1.RunActEvent_Terminal{Terminal: t}}, true, nil

	case "action_trigger":
		triggers := make([]*actv1.ActionTrigger, 0, len(evt.ActionTriggers))
		for _, t := range evt.ActionTriggers {
			triggers = append(triggers, &actv1.ActionTrigger{Action: t.Action, PayloadJson: t.PayloadJSON})
		}
		if len(triggers) == 0 {
			return nil, false, fmt.Errorf("action_trigger event has no triggers")
		}
		return &actv1.RunActEvent{Event: &actv1.RunActEvent_ActionTrigger{ActionTrigger: triggers[0]}}, false, nil

	default:
		return nil, false, fmt.Errorf("unknown event type: %q", evt.Type)
	}
}

func sendWorkerError(stream *connect.ServerStream[actv1.RunActEvent], code, msg string, retryable bool, stage, traceID string) error {
	_ = stream.Send(&actv1.RunActEvent{Event: &actv1.RunActEvent_Terminal{Terminal: &actv1.Terminal{Error: &actv1.ErrorInfo{Code: code, Message: msg, Retryable: retryable, Stage: stage, TraceId: traceID}}}})
	return fmt.Errorf("%s: %s", stage, msg)
}

func (e *ADKWorkerExecutor) appendEvent(ctx context.Context, input domain.RunActInput, seq int, evt *actv1.RunActEvent) {
	if e.recorder == nil {
		return
	}
	if err := e.recorder.AppendEvent(ctx, input, seq, evt); err != nil {
		slog.Warn("actRuns append event failed", "trace_id", input.TraceID, "seq", seq, "err", err)
	}
}

func (e *ADKWorkerExecutor) finishFromTerminal(ctx context.Context, input domain.RunActInput, terminal *actv1.Terminal) {
	if e.recorder == nil || terminal == nil {
	} else {
		status := "done"
		if terminal.GetError() != nil {
			status = "error"
		}
		if err := e.recorder.Finish(ctx, input, status, terminal); err != nil {
			slog.Warn("actRuns finish failed", "trace_id", input.TraceID, "status", status, "err", err)
		}
	}
	if e.idem != nil && terminal != nil {
		if err := e.idem.Complete(ctx, input.UID, input.WorkspaceID, input.RequestID, terminal); err != nil {
			slog.Warn("idempotency complete failed", "trace_id", input.TraceID, "err", err)
		}
	}
}

func (e *ADKWorkerExecutor) finishWithWorkerError(ctx context.Context, input domain.RunActInput, code string, msg string, retryable bool, stage string) {
	e.finishFromTerminal(ctx, input, &actv1.Terminal{Error: &actv1.ErrorInfo{Code: code, Message: msg, Retryable: retryable, Stage: stage, TraceId: input.TraceID}})
}

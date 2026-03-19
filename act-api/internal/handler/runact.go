package handler

import (
	"context"
	"errors"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
	"act-api/gen/act/v1/actv1connect"
	"act-api/internal/domain"
	"act-api/internal/usecase"
)

// RunActHandler is a thin Connect RPC adapter.
// It extracts HTTP-level context and delegates to the usecase layer.
type RunActHandler struct {
	actv1connect.UnimplementedActServiceHandler
	uc *usecase.RunActUsecase
}

func NewRunActHandler(uc *usecase.RunActUsecase) *RunActHandler {
	return &RunActHandler{uc: uc}
}

// RunAct implements ActServiceHandler.
func (h *RunActHandler) RunAct(
	ctx context.Context,
	req *connect.Request[actv1.RunActRequest],
	stream *connect.ServerStream[actv1.RunActEvent],
) error {
	traceID := newTraceID()

	// Extract HTTP-level values for the usecase
	reqCtx := usecase.RequestContext{
		AuthHeader: req.Header().Get("Authorization"),
		SIDCookie:  cookieValue(req.Header(), "sid"),
		CSRFCookie: cookieValue(req.Header(), "csrf_token"),
		CSRFHeader: req.Header().Get("X-CSRF-Token"),
	}

	err := h.uc.Execute(ctx, reqCtx, req.Msg, stream, traceID)
	if err == nil {
		return nil
	}

	// Map domain.StageError to stream Terminal.Error
	var stageErr *domain.StageError
	if errors.As(err, &stageErr) {
		return stageErrorToStream(stream, stageErr, traceID)
	}

	// Unknown error
	return streamError(stream, "INTERNAL", err.Error(), false, "UNKNOWN", traceID, 0)
}

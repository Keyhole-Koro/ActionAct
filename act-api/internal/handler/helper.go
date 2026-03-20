package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"connectrpc.com/connect"

	actv1 "act-api/gen/act/v1"
	"act-api/internal/domain"
)

// streamError sends a Terminal.Error event and returns a Connect error.
func streamError(
	stream *connect.ServerStream[actv1.RunActEvent],
	code string,
	msg string,
	retryable bool,
	stage string,
	traceID string,
	retryAfterMs int64,
) error {
	_ = stream.Send(&actv1.RunActEvent{
		Event: &actv1.RunActEvent_Terminal{
			Terminal: &actv1.Terminal{
				Error: &actv1.ErrorInfo{
					Code:         code,
					Message:      msg,
					Retryable:    retryable,
					Stage:        stage,
					TraceId:      traceID,
					RetryAfterMs: retryAfterMs,
				},
			},
		},
	})
	return connect.NewError(connectCode(code), fmt.Errorf("%s: %s", stage, msg))
}

// stageErrorToStream maps a domain.StageError to a Terminal.Error stream event.
func stageErrorToStream(
	stream *connect.ServerStream[actv1.RunActEvent],
	stageErr *domain.StageError,
	traceID string,
) error {
	code := domainErrToCode(stageErr.Err)
	return streamError(stream, code, stageErr.Err.Error(), stageErr.Retryable, stageErr.Stage, traceID, stageErr.RetryAfterMs)
}

func domainErrToCode(err error) string {
	switch {
	case errors.Is(err, domain.ErrUnauthenticated), errors.Is(err, domain.ErrUIDMismatch):
		return "UNAUTHENTICATED"
	case errors.Is(err, domain.ErrPermissionDenied), errors.Is(err, domain.ErrCSRFMismatch):
		return "PERMISSION_DENIED"
	case errors.Is(err, domain.ErrInvalidArgument):
		return "INVALID_ARGUMENT"
	case errors.Is(err, domain.ErrAlreadyExists):
		return "ALREADY_EXISTS"
	case errors.Is(err, domain.ErrUnavailable):
		return "UNAVAILABLE"
	default:
		return "INTERNAL"
	}
}

func connectCode(code string) connect.Code {
	switch code {
	case "UNAUTHENTICATED":
		return connect.CodeUnauthenticated
	case "PERMISSION_DENIED":
		return connect.CodePermissionDenied
	case "INVALID_ARGUMENT":
		return connect.CodeInvalidArgument
	case "UNAVAILABLE":
		return connect.CodeUnavailable
	case "ALREADY_EXISTS":
		return connect.CodeAlreadyExists
	case "DEADLINE_EXCEEDED":
		return connect.CodeDeadlineExceeded
	default:
		return connect.CodeInternal
	}
}

// cookieValue extracts a named cookie value from HTTP headers.
func cookieValue(header http.Header, name string) string {
	for _, line := range header["Cookie"] {
		for _, part := range strings.Split(line, ";") {
			part = strings.TrimSpace(part)
			kv := strings.SplitN(part, "=", 2)
			if len(kv) == 2 && strings.TrimSpace(kv[0]) == name {
				return strings.TrimSpace(kv[1])
			}
		}
	}
	return ""
}

func newTraceID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func PathParts(path string) []string {
	return strings.Split(strings.Trim(path, "/"), "/")
}

package handler_test

import (
	"errors"
	"net/http"
	"testing"

	"connectrpc.com/connect"

	"act-api/internal/domain"
	"act-api/internal/handler"
)

// ── cookieValue tests ──

func TestCookieValue_SingleCookie(t *testing.T) {
	h := http.Header{}
	h.Set("Cookie", "sid=abc123")
	if got := handler.CookieValueForTest(h, "sid"); got != "abc123" {
		t.Errorf("got %q, want %q", got, "abc123")
	}
}

func TestCookieValue_MultipleCookies(t *testing.T) {
	h := http.Header{}
	h.Set("Cookie", "sid=abc123; csrf_token=xyz456; other=value")
	if got := handler.CookieValueForTest(h, "csrf_token"); got != "xyz456" {
		t.Errorf("got %q, want %q", got, "xyz456")
	}
}

func TestCookieValue_NotFound(t *testing.T) {
	h := http.Header{}
	h.Set("Cookie", "sid=abc123")
	if got := handler.CookieValueForTest(h, "missing"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestCookieValue_EmptyHeader(t *testing.T) {
	h := http.Header{}
	if got := handler.CookieValueForTest(h, "sid"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestCookieValue_WhitespaceHandling(t *testing.T) {
	h := http.Header{}
	h.Set("Cookie", " sid = abc123 ; csrf_token = xyz ")
	if got := handler.CookieValueForTest(h, "sid"); got != "abc123" {
		t.Errorf("got %q, want %q", got, "abc123")
	}
}

func TestCookieValue_EqualsInValue(t *testing.T) {
	h := http.Header{}
	h.Set("Cookie", "token=abc=def=ghi")
	if got := handler.CookieValueForTest(h, "token"); got != "abc=def=ghi" {
		t.Errorf("got %q, want %q", got, "abc=def=ghi")
	}
}

// ── connectCode tests ──

func TestConnectCode_AllMappings(t *testing.T) {
	tests := []struct {
		code string
		want connect.Code
	}{
		{"UNAUTHENTICATED", connect.CodeUnauthenticated},
		{"PERMISSION_DENIED", connect.CodePermissionDenied},
		{"INVALID_ARGUMENT", connect.CodeInvalidArgument},
		{"UNAVAILABLE", connect.CodeUnavailable},
		{"ALREADY_EXISTS", connect.CodeAlreadyExists},
		{"DEADLINE_EXCEEDED", connect.CodeDeadlineExceeded},
		{"UNKNOWN_CODE", connect.CodeInternal},
		{"", connect.CodeInternal},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			got := handler.ConnectCodeForTest(tt.code)
			if got != tt.want {
				t.Errorf("connectCode(%q) = %v, want %v", tt.code, got, tt.want)
			}
		})
	}
}

// ── domainErrToCode tests ──

func TestDomainErrToCode_AllErrors(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"unauthenticated", domain.ErrUnauthenticated, "UNAUTHENTICATED"},
		{"uid_mismatch", domain.ErrUIDMismatch, "UNAUTHENTICATED"},
		{"permission_denied", domain.ErrPermissionDenied, "PERMISSION_DENIED"},
		{"csrf_mismatch", domain.ErrCSRFMismatch, "PERMISSION_DENIED"},
		{"invalid_argument", domain.ErrInvalidArgument, "INVALID_ARGUMENT"},
		{"wrapped_unauthenticated", errors.Join(domain.ErrUnauthenticated, errors.New("extra")), "UNAUTHENTICATED"},
		{"unknown_error", errors.New("something else"), "INTERNAL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := handler.DomainErrToCodeForTest(tt.err)
			if got != tt.want {
				t.Errorf("domainErrToCode(%v) = %q, want %q", tt.err, got, tt.want)
			}
		})
	}
}

// ── newTraceID tests ──

func TestNewTraceID_UniqueAndLength(t *testing.T) {
	ids := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := handler.NewTraceIDForTest()
		if len(id) != 16 { // 8 bytes = 16 hex chars
			t.Errorf("trace ID length = %d, want 16", len(id))
		}
		if ids[id] {
			t.Errorf("duplicate trace ID: %s", id)
		}
		ids[id] = true
	}
}

package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServeMux_BootstrapRoute(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("/auth/session/bootstrap", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/auth/session/bootstrap", nil)
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNoContent)
	}
}

func TestWithCORS_AllowsConfiguredOrigin(t *testing.T) {
	h := withCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), []string{"http://localhost:3000", "https://action-490203.web.app"})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	req.Header.Set("Origin", "https://action-490203.web.app")

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://action-490203.web.app" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "https://action-490203.web.app")
	}
}

func TestWithCORS_RejectsUnknownOriginPreflight(t *testing.T) {
	h := withCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), []string{"http://localhost:3000"})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set("Origin", "https://app.example.com")

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
}
func TestWithCORS_Allow
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


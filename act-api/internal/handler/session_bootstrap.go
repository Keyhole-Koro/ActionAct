package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"act-api/internal/domain"
)

type sessionBootstrapAuthVerifier interface {
	VerifyToken(ctx context.Context, authHeader string) (uid string, err error)
}

type sessionBootstrapIssuer interface {
	Issue(ctx context.Context, uid string) (sid string, csrfToken string, err error)
}

type SessionBootstrapHandler struct {
	auth           sessionBootstrapAuthVerifier
	issuer         sessionBootstrapIssuer
	sidTTLSeconds  int
	csrfTTLSeconds int
}

func NewSessionBootstrapHandler(
	auth sessionBootstrapAuthVerifier,
	issuer sessionBootstrapIssuer,
	sidTTLSeconds int,
	csrfTTLSeconds int,
) *SessionBootstrapHandler {
	return &SessionBootstrapHandler{
		auth:           auth,
		issuer:         issuer,
		sidTTLSeconds:  sidTTLSeconds,
		csrfTTLSeconds: csrfTTLSeconds,
	}
}

func (h *SessionBootstrapHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	traceID := newTraceID()
	uid, err := h.auth.VerifyToken(r.Context(), r.Header.Get("Authorization"))
	if err != nil {
		slog.Warn("session bootstrap auth failed", "trace_id", traceID, "err", err)
		http.Error(w, domain.ErrUnauthenticated.Error(), http.StatusUnauthorized)
		return
	}

	sid, csrfToken, err := h.issuer.Issue(r.Context(), uid)
	if err != nil {
		slog.Error("session bootstrap issue failed", "trace_id", traceID, "uid", uid, "err", err)
		http.Error(w, "session bootstrap failed", http.StatusServiceUnavailable)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "sid",
		Value:    sid,
		Path:     "/",
		MaxAge:   h.sidTTLSeconds,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
		Secure:   true,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "csrf_token",
		Value:    csrfToken,
		Path:     "/",
		MaxAge:   h.csrfTTLSeconds,
		HttpOnly: false,
		SameSite: http.SameSiteNoneMode,
		Secure:   true,
		Expires:  time.Now().Add(time.Duration(h.csrfTTLSeconds) * time.Second),
	})
	w.Header().Set("X-CSRF-Token", csrfToken)

	w.WriteHeader(http.StatusNoContent)
}

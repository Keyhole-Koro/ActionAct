package adapter

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/oauth2"
	"google.golang.org/api/idtoken"
)

type ADKWorkerRequestAuthorizer interface {
	Authorize(ctx context.Context, req *http.Request) error
}

type noopADKWorkerRequestAuthorizer struct{}

func (noopADKWorkerRequestAuthorizer) Authorize(context.Context, *http.Request) error {
	return nil
}

type idTokenADKWorkerRequestAuthorizer struct {
	tokenSource oauth2.TokenSource
}

func (a *idTokenADKWorkerRequestAuthorizer) Authorize(ctx context.Context, req *http.Request) error {
	tok, err := a.tokenSource.Token()
	if err != nil {
		return fmt.Errorf("fetch worker id token: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	return nil
}

func NewADKWorkerRequestAuthorizer(ctx context.Context, workerURL string, mode string, audience string) (ADKWorkerRequestAuthorizer, error) {
	useToken, err := shouldUseWorkerIDToken(mode, workerURL)
	if err != nil {
		return nil, err
	}
	if !useToken {
		return noopADKWorkerRequestAuthorizer{}, nil
	}

	if strings.TrimSpace(audience) == "" {
		audience = workerURL
	}

	tokenSource, err := idtoken.NewTokenSource(ctx, audience)
	if err != nil {
		return nil, fmt.Errorf("create worker id token source: %w", err)
	}

	return &idTokenADKWorkerRequestAuthorizer{tokenSource: tokenSource}, nil
}

func shouldUseWorkerIDToken(mode string, workerURL string) (bool, error) {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "" {
		m = "auto"
	}

	switch m {
	case "off":
		return false, nil
	case "on":
		return true, nil
	case "auto":
		u, err := url.Parse(workerURL)
		if err != nil {
			return false, fmt.Errorf("parse ACT_ADK_WORKER_URL: %w", err)
		}

		host := strings.ToLower(u.Hostname())
		if host == "" {
			return false, fmt.Errorf("ACT_ADK_WORKER_URL has empty host")
		}

		if host == "localhost" || host == "127.0.0.1" || host == "::1" {
			return false, nil
		}

		return true, nil
	default:
		return false, fmt.Errorf("invalid ADK_WORKER_AUTH_MODE: %s (expected auto|on|off)", mode)
	}
}
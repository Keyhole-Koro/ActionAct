package adapter

import (
	"context"
	"net/http"
	"time"

	"golang.org/x/oauth2"
	"google.golang.org/api/idtoken"
)

type idTokenTransport struct {
	base http.RoundTripper
	ts   oauth2.TokenSource
}

func (t *idTokenTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	token, err := t.ts.Token()
	if err != nil {
		return nil, err
	}

	cloned := req.Clone(req.Context())
	cloned.Header = req.Header.Clone()
	cloned.Header.Set("Authorization", "Bearer "+token.AccessToken)

	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(cloned)
}

func NewCloudRunServiceHTTPClient(ctx context.Context, audience string, timeout time.Duration) (*http.Client, error) {
	ts, err := idtoken.NewTokenSource(ctx, audience)
	if err != nil {
		return nil, err
	}

	return &http.Client{
		Timeout: timeout,
		Transport: &idTokenTransport{
			base: http.DefaultTransport,
			ts:   ts,
		},
	}, nil
}

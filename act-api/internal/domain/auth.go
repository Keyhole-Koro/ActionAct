package domain

import "context"

// AuthVerifier verifies an authentication credential (e.g. Firebase ID token)
// and returns the authenticated user's UID.
type AuthVerifier interface {
	VerifyToken(ctx context.Context, authHeader string) (uid string, err error)
}

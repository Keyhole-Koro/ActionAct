package domain

import "context"

// SessionValidator validates a session identifier (e.g. sid cookie)
// against the authenticated user's UID.
type SessionValidator interface {
	ValidateSID(ctx context.Context, uid string, sid string) error
}

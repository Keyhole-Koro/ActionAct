package domain

import "context"

// AuthzVerifier checks workspace membership and topic access.
type AuthzVerifier interface {
	AuthorizeRunAct(ctx context.Context, uid, workspaceID, topicID string) error
}

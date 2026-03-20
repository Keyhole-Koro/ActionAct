package adapter

import (
	"context"
	"fmt"
	"strings"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"act-api/internal/domain"
)

type FirestoreAuthzVerifier struct {
	client *firestore.Client
}

func NewFirestoreAuthzVerifier(ctx context.Context, project string) (*FirestoreAuthzVerifier, error) {
	client, err := firestore.NewClient(ctx, project)
	if err != nil {
		return nil, fmt.Errorf("create firestore client: %w", err)
	}
	return &FirestoreAuthzVerifier{client: client}, nil
}

func (v *FirestoreAuthzVerifier) AuthorizeRunAct(ctx context.Context, uid, workspaceID, topicID string) error {
	// 1. Check if user is a member of the workspace
	memberPath := fmt.Sprintf("workspaces/%s/members/%s", workspaceID, uid)
	memberSnap, err := v.client.Doc(memberPath).Get(ctx)
	isMember := err == nil && memberSnap.Exists()

	if isMember {
		role, _ := memberSnap.Data()["role"].(string)
		if strings.ToLower(strings.TrimSpace(role)) == "viewer" {
			return domain.ErrPermissionDenied
		}
		return nil
	}

	// 2. If not a member, check if the workspace is public
	wsPath := fmt.Sprintf("workspaces/%s", workspaceID)
	wsSnap, err := v.client.Doc(wsPath).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read workspace: %v", domain.ErrUnavailable, err)
	}
	vis, _ := wsSnap.Data()["visibility"].(string)
	if vis != "public" {
		return domain.ErrPermissionDenied
	}
	return nil
}

func (v *FirestoreAuthzVerifier) Close() error {
	if v == nil || v.client == nil {
		return nil
	}
	return v.client.Close()
}

var _ domain.AuthzVerifier = (*FirestoreAuthzVerifier)(nil)
var _ interface{ Close() error } = (*FirestoreAuthzVerifier)(nil)

package adapter

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"act-api/internal/domain"
)

// FirestoreWorkspaceVisibilityUpdater updates workspace visibility (owner-only).
type FirestoreWorkspaceVisibilityUpdater struct {
	client *firestore.Client
}

func NewFirestoreWorkspaceVisibilityUpdater(client *firestore.Client) *FirestoreWorkspaceVisibilityUpdater {
	return &FirestoreWorkspaceVisibilityUpdater{client: client}
}

func (u *FirestoreWorkspaceVisibilityUpdater) UpdateVisibility(
	ctx context.Context,
	uid string,
	workspaceID string,
	visibility string,
) error {
	memberPath := fmt.Sprintf("workspaces/%s/members/%s", workspaceID, uid)
	memberSnap, err := u.client.Doc(memberPath).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read workspace member: %v", domain.ErrUnavailable, err)
	}
	if !memberSnap.Exists() {
		return domain.ErrPermissionDenied
	}

	memberData := memberSnap.Data()
	role, _ := memberData["role"].(string)
	if role != "owner" {
		return domain.ErrPermissionDenied
	}

	workspaceRef := u.client.Doc(fmt.Sprintf("workspaces/%s", workspaceID))
	workspaceSnap, err := workspaceRef.Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return fmt.Errorf("%w: workspace not found", domain.ErrInvalidArgument)
		}
		return fmt.Errorf("%w: read workspace: %v", domain.ErrUnavailable, err)
	}
	if !workspaceSnap.Exists() {
		return fmt.Errorf("%w: workspace not found", domain.ErrInvalidArgument)
	}

	_, err = workspaceRef.Set(ctx, map[string]interface{}{
		"visibility": visibility,
		"updatedAt":  firestore.ServerTimestamp,
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("%w: update workspace visibility: %v", domain.ErrUnavailable, err)
	}

	return nil
}

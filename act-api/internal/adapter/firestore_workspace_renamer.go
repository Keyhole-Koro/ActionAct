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

// FirestoreWorkspaceRenamer updates workspace metadata with server-side authz checks.
type FirestoreWorkspaceRenamer struct {
	client *firestore.Client
}

func NewFirestoreWorkspaceRenamer(client *firestore.Client) *FirestoreWorkspaceRenamer {
	return &FirestoreWorkspaceRenamer{client: client}
}

func (r *FirestoreWorkspaceRenamer) RenameWorkspace(
	ctx context.Context,
	uid string,
	workspaceID string,
	newName string,
) error {
	memberPath := fmt.Sprintf("workspaces/%s/members/%s", workspaceID, uid)
	memberSnap, err := r.client.Doc(memberPath).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read workspace member: %v", domain.ErrUnavailable, err)
	}
	if !memberSnap.Exists() {
		return domain.ErrPermissionDenied
	}

	workspaceRef := r.client.Doc(fmt.Sprintf("workspaces/%s", workspaceID))
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
		"name":      strings.TrimSpace(newName),
		"updatedAt": firestore.ServerTimestamp,
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("%w: update workspace: %v", domain.ErrUnavailable, err)
	}

	return nil
}

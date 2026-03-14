package adapter

import (
	"context"
	"fmt"

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
	memberPath := fmt.Sprintf("workspaces/%s/members/%s", workspaceID, uid)
	memberSnap, err := v.client.Doc(memberPath).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read workspace member: %v", domain.ErrUnavailable, err)
	}
	if !memberSnap.Exists() {
		return domain.ErrPermissionDenied
	}

	topicPath := fmt.Sprintf("workspaces/%s/topics/%s", workspaceID, topicID)
	topicSnap, err := v.client.Doc(topicPath).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read topic: %v", domain.ErrUnavailable, err)
	}
	if !topicSnap.Exists() {
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

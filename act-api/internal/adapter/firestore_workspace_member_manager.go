package adapter

import (
	"context"
	"fmt"
	"strings"

	"cloud.google.com/go/firestore"
	firebaseauth "firebase.google.com/go/v4/auth"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"act-api/internal/domain"
)

type FirestoreWorkspaceMemberManager struct {
	fsClient   *firestore.Client
	authClient *firebaseauth.Client
}

func NewFirestoreWorkspaceMemberManager(fsClient *firestore.Client, authClient *firebaseauth.Client) *FirestoreWorkspaceMemberManager {
	return &FirestoreWorkspaceMemberManager{
		fsClient:   fsClient,
		authClient: authClient,
	}
}

func (m *FirestoreWorkspaceMemberManager) SearchUsers(
	ctx context.Context,
	requesterUID string,
	workspaceID string,
	query string,
	limit int,
) ([]domain.WorkspaceUser, error) {
	if err := m.ensureWorkspaceMember(ctx, requesterUID, workspaceID); err != nil {
		return nil, err
	}

	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		return nil, fmt.Errorf("%w: query is required", domain.ErrInvalidArgument)
	}

	if limit <= 0 {
		limit = 10
	}
	if limit > 20 {
		limit = 20
	}

	users := make([]domain.WorkspaceUser, 0, limit)
	iter := m.authClient.Users(ctx, "")
	for len(users) < limit {
		record, err := iter.Next()
		if err != nil {
			if err == iterator.Done {
				break
			}
			return nil, fmt.Errorf("%w: list users: %v", domain.ErrUnavailable, err)
		}

		email := strings.TrimSpace(record.Email)
		displayName := strings.TrimSpace(record.DisplayName)
		uid := strings.TrimSpace(record.UID)

		if uid == requesterUID {
			continue
		}

		if !containsFold(uid, normalizedQuery) && !containsFold(email, normalizedQuery) && !containsFold(displayName, normalizedQuery) {
			continue
		}

		users = append(users, domain.WorkspaceUser{
			UID:         uid,
			Email:       email,
			DisplayName: displayName,
		})
	}

	return users, nil
}

func (m *FirestoreWorkspaceMemberManager) AddMember(
	ctx context.Context,
	requesterUID string,
	workspaceID string,
	targetUID string,
	role string,
) error {
	if requesterUID == targetUID {
		return fmt.Errorf("%w: cannot add yourself as a member", domain.ErrInvalidArgument)
	}

	if err := m.ensureWorkspaceOwner(ctx, requesterUID, workspaceID); err != nil {
		return err
	}

	workspaceRef := m.fsClient.Doc(fmt.Sprintf("workspaces/%s", workspaceID))
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

	userRecord, err := m.authClient.GetUser(ctx, targetUID)
	if err != nil {
		return fmt.Errorf("%w: target user not found", domain.ErrInvalidArgument)
	}

	memberRef := m.fsClient.Doc(fmt.Sprintf("workspaces/%s/members/%s", workspaceID, targetUID))
	_, err = memberRef.Set(ctx, map[string]interface{}{
		"uid":         targetUID,
		"email":       strings.TrimSpace(userRecord.Email),
		"displayName": strings.TrimSpace(userRecord.DisplayName),
		"role":        role,
		"status":      "active",
		"addedBy":     requesterUID,
		"updatedAt":   firestore.ServerTimestamp,
		"createdAt":   firestore.ServerTimestamp,
	}, firestore.MergeAll)
	if err != nil {
		return fmt.Errorf("%w: write member: %v", domain.ErrUnavailable, err)
	}

	return nil
}

func (m *FirestoreWorkspaceMemberManager) ensureWorkspaceMember(ctx context.Context, uid string, workspaceID string) error {
	memberRef := m.fsClient.Doc(fmt.Sprintf("workspaces/%s/members/%s", workspaceID, uid))
	memberSnap, err := memberRef.Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read workspace member: %v", domain.ErrUnavailable, err)
	}
	if !memberSnap.Exists() {
		return domain.ErrPermissionDenied
	}
	return nil
}

func (m *FirestoreWorkspaceMemberManager) ensureWorkspaceOwner(ctx context.Context, uid string, workspaceID string) error {
	memberRef := m.fsClient.Doc(fmt.Sprintf("workspaces/%s/members/%s", workspaceID, uid))
	memberSnap, err := memberRef.Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return domain.ErrPermissionDenied
		}
		return fmt.Errorf("%w: read workspace member: %v", domain.ErrUnavailable, err)
	}
	if !memberSnap.Exists() {
		return domain.ErrPermissionDenied
	}

	role, _ := memberSnap.Data()["role"].(string)
	role = strings.ToLower(strings.TrimSpace(role))
	if role != "owner" && role != "" {
		return domain.ErrPermissionDenied
	}

	return nil
}

func containsFold(value, needle string) bool {
	if needle == "" {
		return true
	}
	return strings.Contains(strings.ToLower(strings.TrimSpace(value)), needle)
}

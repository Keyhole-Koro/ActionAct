package usecase

import (
	"context"
	"fmt"
	"strings"

	"act-api/internal/domain"
)

type workspaceMemberManager interface {
	SearchUsers(ctx context.Context, requesterUID, workspaceID, query string, limit int) ([]domain.WorkspaceUser, error)
	AddMember(ctx context.Context, requesterUID, workspaceID, targetUID, role string) error
}

type SearchWorkspaceUsersUsecase struct {
	authVerifier domain.AuthVerifier
	manager      workspaceMemberManager
}

func NewSearchWorkspaceUsersUsecase(authVerifier domain.AuthVerifier, manager workspaceMemberManager) *SearchWorkspaceUsersUsecase {
	return &SearchWorkspaceUsersUsecase{
		authVerifier: authVerifier,
		manager:      manager,
	}
}

func (u *SearchWorkspaceUsersUsecase) Execute(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	query string,
	limit int,
) ([]domain.WorkspaceUser, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	query = strings.TrimSpace(query)

	if workspaceID == "" {
		return nil, fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if len([]rune(query)) < 2 {
		return nil, fmt.Errorf("%w: query must be at least 2 characters", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}

	return u.manager.SearchUsers(ctx, uid, workspaceID, query, limit)
}

type AddWorkspaceMemberUsecase struct {
	authVerifier domain.AuthVerifier
	manager      workspaceMemberManager
}

func NewAddWorkspaceMemberUsecase(authVerifier domain.AuthVerifier, manager workspaceMemberManager) *AddWorkspaceMemberUsecase {
	return &AddWorkspaceMemberUsecase{
		authVerifier: authVerifier,
		manager:      manager,
	}
}

func (u *AddWorkspaceMemberUsecase) Execute(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	targetUID string,
	role string,
) error {
	workspaceID = strings.TrimSpace(workspaceID)
	targetUID = strings.TrimSpace(targetUID)
	role = strings.ToLower(strings.TrimSpace(role))

	if workspaceID == "" {
		return fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if targetUID == "" {
		return fmt.Errorf("%w: user_id is required", domain.ErrInvalidArgument)
	}
	if role != "editor" && role != "viewer" && role != "owner" {
		return fmt.Errorf("%w: role must be editor, viewer, or owner", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	return u.manager.AddMember(ctx, uid, workspaceID, targetUID, role)
}

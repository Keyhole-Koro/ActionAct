package usecase

import (
	"context"
	"fmt"
	"strings"

	"act-api/internal/domain"
)

type workspaceVisibilityUpdater interface {
	UpdateVisibility(ctx context.Context, uid, workspaceID, visibility string) error
}

// UpdateWorkspaceVisibilityUsecase verifies auth and updates workspace visibility.
type UpdateWorkspaceVisibilityUsecase struct {
	authVerifier domain.AuthVerifier
	updater      workspaceVisibilityUpdater
}

func NewUpdateWorkspaceVisibilityUsecase(authVerifier domain.AuthVerifier, updater workspaceVisibilityUpdater) *UpdateWorkspaceVisibilityUsecase {
	return &UpdateWorkspaceVisibilityUsecase{
		authVerifier: authVerifier,
		updater:      updater,
	}
}

func (u *UpdateWorkspaceVisibilityUsecase) Execute(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	visibility string,
) error {
	workspaceID = strings.TrimSpace(workspaceID)
	visibility = strings.TrimSpace(visibility)

	if workspaceID == "" {
		return fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if visibility != "public" && visibility != "private" {
		return fmt.Errorf("%w: visibility must be 'public' or 'private'", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	if err := u.updater.UpdateVisibility(ctx, uid, workspaceID, visibility); err != nil {
		return err
	}

	return nil
}

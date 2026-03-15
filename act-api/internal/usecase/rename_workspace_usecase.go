package usecase

import (
	"context"
	"fmt"
	"strings"

	"act-api/internal/domain"
)

type workspaceRenamer interface {
	RenameWorkspace(ctx context.Context, uid, workspaceID, newName string) error
}

// RenameWorkspaceUsecase verifies auth and updates workspace name.
type RenameWorkspaceUsecase struct {
	authVerifier domain.AuthVerifier
	renamer      workspaceRenamer
}

func NewRenameWorkspaceUsecase(authVerifier domain.AuthVerifier, renamer workspaceRenamer) *RenameWorkspaceUsecase {
	return &RenameWorkspaceUsecase{
		authVerifier: authVerifier,
		renamer:      renamer,
	}
}

func (u *RenameWorkspaceUsecase) Execute(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	newName string,
) error {
	workspaceID = strings.TrimSpace(workspaceID)
	newName = strings.TrimSpace(newName)

	if workspaceID == "" {
		return fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if newName == "" {
		return fmt.Errorf("%w: name is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	if err := u.renamer.RenameWorkspace(ctx, uid, workspaceID, newName); err != nil {
		return err
	}

	return nil
}

package usecase

import (
	"context"
	"fmt"
	"strings"

	"act-api/internal/domain"
)

type workspaceDiscordManager interface {
	BuildInviteURL(ctx context.Context, requesterUID, workspaceID, applicationID string) (string, error)
	ConnectGuild(ctx context.Context, requesterUID, workspaceID, guildID, guildName string) error
	CreateInstallSession(ctx context.Context, requesterUID, workspaceID, applicationID string) (*domain.DiscordInstallSession, error)
	GetInstallSession(ctx context.Context, requesterUID, workspaceID, sessionID string) (*domain.DiscordInstallSession, error)
	ConfirmInstallSession(ctx context.Context, requesterUID, workspaceID, sessionID, guildID string) error
}

type GetDiscordInviteURLUsecase struct {
	authVerifier         domain.AuthVerifier
	manager              workspaceDiscordManager
	discordApplicationID string
}

func NewGetDiscordInviteURLUsecase(authVerifier domain.AuthVerifier, manager workspaceDiscordManager, discordApplicationID string) *GetDiscordInviteURLUsecase {
	return &GetDiscordInviteURLUsecase{
		authVerifier:         authVerifier,
		manager:              manager,
		discordApplicationID: strings.TrimSpace(discordApplicationID),
	}
}

func (u *GetDiscordInviteURLUsecase) Execute(ctx context.Context, authHeader, workspaceID string) (string, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return "", fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if strings.TrimSpace(u.discordApplicationID) == "" {
		return "", fmt.Errorf("%w: discord application id is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return "", fmt.Errorf("auth: %w", err)
	}

	return u.manager.BuildInviteURL(ctx, uid, workspaceID, u.discordApplicationID)
}

type ConnectDiscordGuildUsecase struct {
	authVerifier domain.AuthVerifier
	manager      workspaceDiscordManager
}

func NewConnectDiscordGuildUsecase(authVerifier domain.AuthVerifier, manager workspaceDiscordManager) *ConnectDiscordGuildUsecase {
	return &ConnectDiscordGuildUsecase{
		authVerifier: authVerifier,
		manager:      manager,
	}
}

func (u *ConnectDiscordGuildUsecase) Execute(ctx context.Context, authHeader, workspaceID, guildID, guildName string) error {
	workspaceID = strings.TrimSpace(workspaceID)
	guildID = strings.TrimSpace(guildID)
	guildName = strings.TrimSpace(guildName)

	if workspaceID == "" {
		return fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if guildID == "" {
		return fmt.Errorf("%w: guild_id is required", domain.ErrInvalidArgument)
	}
	if guildName == "" {
		return fmt.Errorf("%w: guild_name is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	return u.manager.ConnectGuild(ctx, uid, workspaceID, guildID, guildName)
}

type CreateDiscordInstallSessionUsecase struct {
	authVerifier         domain.AuthVerifier
	manager              workspaceDiscordManager
	discordApplicationID string
}

func NewCreateDiscordInstallSessionUsecase(authVerifier domain.AuthVerifier, manager workspaceDiscordManager, discordApplicationID string) *CreateDiscordInstallSessionUsecase {
	return &CreateDiscordInstallSessionUsecase{
		authVerifier:         authVerifier,
		manager:              manager,
		discordApplicationID: strings.TrimSpace(discordApplicationID),
	}
}

func (u *CreateDiscordInstallSessionUsecase) Execute(ctx context.Context, authHeader, workspaceID string) (*domain.DiscordInstallSession, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if u.discordApplicationID == "" {
		return nil, fmt.Errorf("%w: discord application id is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}

	return u.manager.CreateInstallSession(ctx, uid, workspaceID, u.discordApplicationID)
}

type GetDiscordInstallSessionUsecase struct {
	authVerifier domain.AuthVerifier
	manager      workspaceDiscordManager
}

func NewGetDiscordInstallSessionUsecase(authVerifier domain.AuthVerifier, manager workspaceDiscordManager) *GetDiscordInstallSessionUsecase {
	return &GetDiscordInstallSessionUsecase{
		authVerifier: authVerifier,
		manager:      manager,
	}
}

func (u *GetDiscordInstallSessionUsecase) Execute(ctx context.Context, authHeader, workspaceID, sessionID string) (*domain.DiscordInstallSession, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	sessionID = strings.TrimSpace(sessionID)
	if workspaceID == "" {
		return nil, fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if sessionID == "" {
		return nil, fmt.Errorf("%w: session_id is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}

	return u.manager.GetInstallSession(ctx, uid, workspaceID, sessionID)
}

type ConfirmDiscordInstallSessionUsecase struct {
	authVerifier domain.AuthVerifier
	manager      workspaceDiscordManager
}

func NewConfirmDiscordInstallSessionUsecase(authVerifier domain.AuthVerifier, manager workspaceDiscordManager) *ConfirmDiscordInstallSessionUsecase {
	return &ConfirmDiscordInstallSessionUsecase{
		authVerifier: authVerifier,
		manager:      manager,
	}
}

func (u *ConfirmDiscordInstallSessionUsecase) Execute(ctx context.Context, authHeader, workspaceID, sessionID, guildID string) error {
	workspaceID = strings.TrimSpace(workspaceID)
	sessionID = strings.TrimSpace(sessionID)
	guildID = strings.TrimSpace(guildID)
	if workspaceID == "" {
		return fmt.Errorf("%w: workspace_id is required", domain.ErrInvalidArgument)
	}
	if sessionID == "" {
		return fmt.Errorf("%w: session_id is required", domain.ErrInvalidArgument)
	}
	if guildID == "" {
		return fmt.Errorf("%w: guild_id is required", domain.ErrInvalidArgument)
	}

	uid, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}

	return u.manager.ConfirmInstallSession(ctx, uid, workspaceID, sessionID, guildID)
}

package adapter

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"act-api/internal/domain"
)

type FirestoreWorkspaceDiscordManager struct {
	fsClient *firestore.Client
}

const discordInstallSessionTTL = 15 * time.Minute

func NewFirestoreWorkspaceDiscordManager(fsClient *firestore.Client) *FirestoreWorkspaceDiscordManager {
	return &FirestoreWorkspaceDiscordManager{fsClient: fsClient}
}

func (m *FirestoreWorkspaceDiscordManager) BuildInviteURL(ctx context.Context, requesterUID, workspaceID, applicationID string) (string, error) {
	if err := m.ensureWorkspaceOwner(ctx, requesterUID, workspaceID); err != nil {
		return "", err
	}
	return buildDiscordInviteURL(applicationID, ""), nil
}

func (m *FirestoreWorkspaceDiscordManager) CreateInstallSession(ctx context.Context, requesterUID, workspaceID, applicationID string) (*domain.DiscordInstallSession, error) {
	if err := m.ensureWorkspaceOwner(ctx, requesterUID, workspaceID); err != nil {
		return nil, err
	}

	sessionID := "dis-" + uuid.NewString()
	expiresAt := time.Now().UTC().Add(discordInstallSessionTTL)
	sessionRef := m.fsClient.Doc(fmt.Sprintf("discord_install_sessions/%s", sessionID))
	_, err := sessionRef.Set(ctx, map[string]interface{}{
		"workspaceId":     workspaceID,
		"requestedBy":     requesterUID,
		"status":          "pending",
		"selectedGuildId": "",
		"createdAt":       firestore.ServerTimestamp,
		"updatedAt":       firestore.ServerTimestamp,
		"expiresAt":       expiresAt,
	}, firestore.MergeAll)
	if err != nil {
		return nil, fmt.Errorf("%w: create discord install session: %v", domain.ErrUnavailable, err)
	}

	return &domain.DiscordInstallSession{
		SessionID:   sessionID,
		WorkspaceID: workspaceID,
		Status:      "pending",
		InviteURL:   buildDiscordInviteURL(applicationID, sessionID),
		ExpiresAt:   expiresAt.UnixMilli(),
	}, nil
}

func (m *FirestoreWorkspaceDiscordManager) GetInstallSession(ctx context.Context, requesterUID, workspaceID, sessionID string) (*domain.DiscordInstallSession, error) {
	if err := m.ensureWorkspaceOwner(ctx, requesterUID, workspaceID); err != nil {
		return nil, err
	}

	sessionRef := m.fsClient.Doc(fmt.Sprintf("discord_install_sessions/%s", sessionID))
	sessionSnap, err := sessionRef.Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, fmt.Errorf("%w: install session not found", domain.ErrInvalidArgument)
		}
		return nil, fmt.Errorf("%w: read discord install session: %v", domain.ErrUnavailable, err)
	}
	if !sessionSnap.Exists() {
		return nil, fmt.Errorf("%w: install session not found", domain.ErrInvalidArgument)
	}

	data := sessionSnap.Data()
	sessionWorkspaceID, _ := data["workspaceId"].(string)
	if sessionWorkspaceID != workspaceID {
		return nil, domain.ErrPermissionDenied
	}

	candidates := make([]domain.DiscordInstallCandidate, 0)
	iter := sessionRef.Collection("candidates").Documents(ctx)
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err != nil {
			if err == iterator.Done {
				break
			}
			return nil, fmt.Errorf("%w: read discord install candidates: %v", domain.ErrUnavailable, err)
		}
		candidateData := doc.Data()
		joinedAt := int64(0)
		if ts, ok := candidateData["joinedAt"].(time.Time); ok {
			joinedAt = ts.UnixMilli()
		} else if ts, ok := candidateData["joinedAt"].(*time.Time); ok && ts != nil {
			joinedAt = ts.UnixMilli()
		}
		candidates = append(candidates, domain.DiscordInstallCandidate{
			GuildID:   doc.Ref.ID,
			GuildName: stringValue(candidateData["guildName"]),
			Source:    stringValue(candidateData["source"]),
			JoinedAt:  joinedAt,
		})
	}

	expiresAt := int64(0)
	switch ts := data["expiresAt"].(type) {
	case time.Time:
		expiresAt = ts.UnixMilli()
	case *time.Time:
		if ts != nil {
			expiresAt = ts.UnixMilli()
		}
	}

	return &domain.DiscordInstallSession{
		SessionID:       sessionID,
		WorkspaceID:     workspaceID,
		Status:          stringValue(data["status"]),
		SelectedGuildID: stringValue(data["selectedGuildId"]),
		ExpiresAt:       expiresAt,
		Candidates:      candidates,
	}, nil
}

func (m *FirestoreWorkspaceDiscordManager) ConfirmInstallSession(ctx context.Context, requesterUID, workspaceID, sessionID, guildID string) error {
	if err := m.ensureWorkspaceOwner(ctx, requesterUID, workspaceID); err != nil {
		return err
	}

	sessionRef := m.fsClient.Doc(fmt.Sprintf("discord_install_sessions/%s", sessionID))
	candidateRef := sessionRef.Collection("candidates").Doc(guildID)
	guildBindingRef := m.fsClient.Doc(fmt.Sprintf("discord_guild_bindings/%s", guildID))
	workspaceIntegrationRef := m.fsClient.Doc(fmt.Sprintf("workspaces/%s/integrations/discord", workspaceID))

	return m.fsClient.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		sessionSnap, err := tx.Get(sessionRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return fmt.Errorf("%w: install session not found", domain.ErrInvalidArgument)
			}
			return fmt.Errorf("%w: read install session: %v", domain.ErrUnavailable, err)
		}
		sessionData := sessionSnap.Data()
		if stringValue(sessionData["workspaceId"]) != workspaceID {
			return domain.ErrPermissionDenied
		}
		sessionStatus := stringValue(sessionData["status"])
		if sessionStatus != "pending" && sessionStatus != "awaiting_confirmation" {
			return fmt.Errorf("%w: install session is not confirmable", domain.ErrInvalidArgument)
		}
		if expiresAt, ok := sessionData["expiresAt"].(time.Time); ok && time.Now().UTC().After(expiresAt) {
			return fmt.Errorf("%w: install session expired", domain.ErrInvalidArgument)
		}

		candidateSnap, err := tx.Get(candidateRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return fmt.Errorf("%w: guild candidate not found", domain.ErrInvalidArgument)
			}
			return fmt.Errorf("%w: read guild candidate: %v", domain.ErrUnavailable, err)
		}
		guildName := stringValue(candidateSnap.Data()["guildName"])
		if guildName == "" {
			return fmt.Errorf("%w: guild candidate missing guild name", domain.ErrInvalidArgument)
		}

		bindingSnap, err := tx.Get(guildBindingRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return fmt.Errorf("%w: read guild binding: %v", domain.ErrUnavailable, err)
		}
		if bindingSnap != nil && bindingSnap.Exists() {
			existingWorkspaceID := stringValue(bindingSnap.Data()["workspaceId"])
			if existingWorkspaceID != "" && existingWorkspaceID != workspaceID {
				return fmt.Errorf("%w: guild already connected to another workspace", domain.ErrAlreadyExists)
			}
		}

		integrationSnap, err := tx.Get(workspaceIntegrationRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return fmt.Errorf("%w: read workspace integration: %v", domain.ErrUnavailable, err)
		}
		if integrationSnap != nil && integrationSnap.Exists() {
			previousGuildID := stringValue(integrationSnap.Data()["guildId"])
			if previousGuildID != "" && previousGuildID != guildID {
				tx.Delete(m.fsClient.Doc(fmt.Sprintf("discord_guild_bindings/%s", previousGuildID)))
			}
		}

		tx.Set(workspaceIntegrationRef, map[string]interface{}{
			"enabled":          true,
			"guildId":          guildID,
			"guildName":        guildName,
			"installedBy":      requesterUID,
			"installedAt":      firestore.ServerTimestamp,
			"botJoined":        true,
			"status":           "active",
			"installSessionId": sessionID,
			"updatedAt":        firestore.ServerTimestamp,
		}, firestore.MergeAll)

		tx.Set(guildBindingRef, map[string]interface{}{
			"workspaceId":      workspaceID,
			"guildId":          guildID,
			"guildName":        guildName,
			"enabled":          true,
			"status":           "active",
			"installedBy":      requesterUID,
			"installSessionId": sessionID,
			"updatedAt":        firestore.ServerTimestamp,
		}, firestore.MergeAll)

		tx.Set(sessionRef, map[string]interface{}{
			"status":          "completed",
			"selectedGuildId": guildID,
			"updatedAt":       firestore.ServerTimestamp,
		}, firestore.MergeAll)

		return nil
	})
}

func buildDiscordInviteURL(applicationID, state string) string {
	values := url.Values{}
	values.Set("client_id", applicationID)
	values.Set("scope", "bot")
	values.Set("permissions", "66560")
	if state != "" {
		values.Set("state", state)
	}
	return "https://discord.com/oauth2/authorize?" + values.Encode()
}

func (m *FirestoreWorkspaceDiscordManager) ConnectGuild(ctx context.Context, requesterUID, workspaceID, guildID, guildName string) error {
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

	guildBindingRef := m.fsClient.Doc(fmt.Sprintf("discord_guild_bindings/%s", guildID))
	workspaceIntegrationRef := m.fsClient.Doc(fmt.Sprintf("workspaces/%s/integrations/discord", workspaceID))

	return m.fsClient.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		bindingSnap, err := tx.Get(guildBindingRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return fmt.Errorf("%w: read discord guild binding: %v", domain.ErrUnavailable, err)
		}
		if bindingSnap != nil && bindingSnap.Exists() {
			existingWorkspaceID, _ := bindingSnap.Data()["workspaceId"].(string)
			if existingWorkspaceID != "" && existingWorkspaceID != workspaceID {
				return fmt.Errorf("%w: guild already connected to another workspace", domain.ErrAlreadyExists)
			}
		}

		integrationSnap, err := tx.Get(workspaceIntegrationRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return fmt.Errorf("%w: read workspace discord integration: %v", domain.ErrUnavailable, err)
		}
		if integrationSnap != nil && integrationSnap.Exists() {
			previousGuildID, _ := integrationSnap.Data()["guildId"].(string)
			if previousGuildID != "" && previousGuildID != guildID {
				tx.Delete(m.fsClient.Doc(fmt.Sprintf("discord_guild_bindings/%s", previousGuildID)))
			}
		}

		tx.Set(workspaceIntegrationRef, map[string]interface{}{
			"enabled":     true,
			"guildId":     guildID,
			"guildName":   guildName,
			"installedBy": requesterUID,
			"installedAt": firestore.ServerTimestamp,
			"botJoined":   true,
			"status":      "active",
			"updatedAt":   firestore.ServerTimestamp,
		}, firestore.MergeAll)

		tx.Set(guildBindingRef, map[string]interface{}{
			"workspaceId": workspaceID,
			"guildId":     guildID,
			"guildName":   guildName,
			"enabled":     true,
			"status":      "active",
			"installedBy": requesterUID,
			"updatedAt":   firestore.ServerTimestamp,
		}, firestore.MergeAll)

		return nil
	})
}

func (m *FirestoreWorkspaceDiscordManager) ensureWorkspaceOwner(ctx context.Context, uid string, workspaceID string) error {
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

func stringValue(value interface{}) string {
	v, _ := value.(string)
	return strings.TrimSpace(v)
}

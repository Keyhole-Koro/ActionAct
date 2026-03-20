package domain

type WorkspaceUser struct {
	UID         string `json:"uid"`
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

type DiscordInstallCandidate struct {
	GuildID   string `json:"guild_id"`
	GuildName string `json:"guild_name"`
	Source    string `json:"source"`
	JoinedAt  int64  `json:"joined_at,omitempty"`
}

type DiscordInstallSession struct {
	SessionID       string                    `json:"session_id"`
	WorkspaceID     string                    `json:"workspace_id"`
	Status          string                    `json:"status"`
	SelectedGuildID string                    `json:"selected_guild_id,omitempty"`
	InviteURL       string                    `json:"invite_url,omitempty"`
	ExpiresAt       int64                     `json:"expires_at,omitempty"`
	Candidates      []DiscordInstallCandidate `json:"candidates,omitempty"`
}

package domain

type WorkspaceUser struct {
	UID         string `json:"uid"`
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

type DiscordInstallCandidate struct {
	GuildID   string `json:"guildId"`
	GuildName string `json:"guildName"`
	Source    string `json:"source"`
	JoinedAt  int64  `json:"joinedAt,omitempty"`
}

type DiscordInstallSession struct {
	SessionID       string                    `json:"sessionId"`
	WorkspaceID     string                    `json:"workspaceId"`
	Status          string                    `json:"status"`
	SelectedGuildID string                    `json:"selectedGuildId,omitempty"`
	InviteURL       string                    `json:"inviteUrl,omitempty"`
	ExpiresAt       int64                     `json:"expiresAt,omitempty"`
	Candidates      []DiscordInstallCandidate `json:"candidates,omitempty"`
}

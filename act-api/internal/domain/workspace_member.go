package domain

type WorkspaceUser struct {
	UID         string `json:"uid"`
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

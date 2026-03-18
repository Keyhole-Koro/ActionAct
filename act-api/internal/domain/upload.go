package domain

import "time"

// UploadInput holds the metadata for a user-uploaded file before it enters the Organize pipeline.
type UploadInput struct {
	InputID          string
	WorkspaceID      string
	ContentType      string
	OriginalFilename string
	SizeBytes        int64
}

// UploadResult is returned after the upload is stored in GCS and recorded in Firestore.
type UploadResult struct {
	InputID string
	TopicID string
	GCSUri  string
	Status  string // "uploaded"
}

// InputDetail represents the persisted metadata of an upload.
type InputDetail struct {
	InputID          string    `firestore:"inputId"`
	WorkspaceID      string    `firestore:"workspaceId"`
	ContentType      string    `firestore:"contentType"`
	OriginalFilename string    `firestore:"originalFilename"`
	SizeBytes        int64     `firestore:"sizeBytes"`
	GCSUri           string    `firestore:"-"`
	CreatedAt        time.Time `firestore:"createdAt"`
}

// DownloadResult contains the file content and its metadata.
type DownloadResult struct {
	Content     []byte
	ContentType string
	Filename    string
}

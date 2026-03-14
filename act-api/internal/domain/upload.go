package domain

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
	GCSUri  string
	Status  string // "uploaded"
}

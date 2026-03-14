package adapter

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"

	"act-api/internal/domain"
)

// FirestoreInputRecorder records upload metadata in Firestore.
type FirestoreInputRecorder struct {
	client *firestore.Client
}

// NewFirestoreInputRecorder creates a recorder using an existing Firestore client.
func NewFirestoreInputRecorder(client *firestore.Client) *FirestoreInputRecorder {
	return &FirestoreInputRecorder{client: client}
}

// RecordInput writes an input document to Firestore at
// workspaces/{workspaceId}/inputs/{inputId}.
func (r *FirestoreInputRecorder) RecordInput(ctx context.Context, input domain.UploadInput, gcsURI string, sha256Hex string) error {
	docRef := r.client.
		Collection("workspaces").Doc(input.WorkspaceID).
		Collection("inputs").Doc(input.InputID)

	_, err := docRef.Set(ctx, map[string]interface{}{
		"status":      "received",
		"contentType": input.ContentType,
		"originalFilename": input.OriginalFilename,
		"sizeBytes":   input.SizeBytes,
		"rawRef": map[string]interface{}{
			"gcsUri": gcsURI,
			"sha256": sha256Hex,
		},
		"createdAt": time.Now().UTC(),
		"updatedAt": time.Now().UTC(),
	})
	if err != nil {
		return fmt.Errorf("firestore set input: %w", err)
	}
	return nil
}

// Close releases the Firestore client.
func (r *FirestoreInputRecorder) Close() error {
	return r.client.Close()
}

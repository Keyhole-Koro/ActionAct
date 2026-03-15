package usecase

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"act-api/internal/adapter"
	"act-api/internal/domain"
)

// UploadUsecase orchestrates the upload flow:
// auth → GCS upload → Firestore record → Pub/Sub event.
type UploadUsecase struct {
	authVerifier  domain.AuthVerifier
	storage       *adapter.GCSStorage
	inputRecorder *adapter.FirestoreInputRecorder
	publisher     *adapter.PubSubPublisher
}

// NewUploadUsecase constructs the usecase with all dependencies.
func NewUploadUsecase(
	authVerifier domain.AuthVerifier,
	storage *adapter.GCSStorage,
	inputRecorder *adapter.FirestoreInputRecorder,
	publisher *adapter.PubSubPublisher,
) *UploadUsecase {
	return &UploadUsecase{
		authVerifier:  authVerifier,
		storage:       storage,
		inputRecorder: inputRecorder,
		publisher:     publisher,
	}
}

// Execute performs the upload pipeline and returns an inputId.
func (u *UploadUsecase) Execute(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	filename string,
	contentType string,
	data []byte,
) (*domain.UploadResult, error) {
	// 1. Auth verification
	_, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}

	// 2. Generate input ID
	inputID := "in_" + uuid.New().String()[:8]

	// 3. Upload to GCS
	objectPath := fmt.Sprintf("mind/inputs/%s.raw", inputID)
	gcsURI, _, sha256Hex, err := u.storage.Upload(ctx, objectPath, data, contentType)
	if err != nil {
		return nil, fmt.Errorf("gcs upload: %w", err)
	}
	slog.Info("uploaded to GCS", "inputId", inputID, "gcsUri", gcsURI, "size", len(data))

	// 4. Record in Firestore
	input := domain.UploadInput{
		InputID:          inputID,
		WorkspaceID:      workspaceID,
		ContentType:      contentType,
		OriginalFilename: filename,
		SizeBytes:        int64(len(data)),
	}
	if err := u.inputRecorder.RecordInput(ctx, input, gcsURI, sha256Hex); err != nil {
		return nil, fmt.Errorf("firestore record: %w", err)
	}
	slog.Info("recorded input in Firestore", "inputId", inputID, "workspaceId", workspaceID)

	// 5. Publish event to Pub/Sub
	topicID := "topic:" + inputID
	idempotencyKey := fmt.Sprintf("type:input.received/topicId:%s/inputId:%s", topicID, inputID)
	if err := u.publisher.Publish(ctx, "input.received", workspaceID, topicID, idempotencyKey, map[string]string{
		"inputId":     inputID,
		"workspaceId": workspaceID,
		"topicId":     topicID,
	}); err != nil {
		// Non-fatal: log error but still return success to user.
		// The event can be replayed from Firestore state.
		slog.Error("pubsub publish failed (non-fatal)", "inputId", inputID, "err", err)
	} else {
		slog.Info("published input.received event", "inputId", inputID)
	}

	return &domain.UploadResult{
		InputID: inputID,
		GCSUri:  gcsURI,
		Status:  "uploaded",
	}, nil
}

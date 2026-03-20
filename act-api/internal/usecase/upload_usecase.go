package usecase

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"path"
	"path/filepath"
	"strings"

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

	if strings.HasPrefix(contentType, "application/zip") || strings.HasSuffix(filename, ".zip") {
		slog.Info("handling zip file", "filename", filename, "size", len(data))
		zipReader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			return nil, fmt.Errorf("zip read: %w", err)
		}

		// Use the first valid file to create a topic
		var primaryResult *domain.UploadResult

		for _, file := range zipReader.File {
			if file.FileInfo().IsDir() || strings.HasPrefix(file.Name, ".") || strings.HasPrefix(file.Name, "__MACOSX") {
				continue
			}

			fileContent, err := file.Open()
			if err != nil {
				slog.Warn("failed to open file in zip", "filename", file.Name, "err", err)
				continue
			}
			defer fileContent.Close()

			contentBytes, err := io.ReadAll(fileContent)
			if err != nil {
				slog.Warn("failed to read file in zip", "filename", file.Name, "err", err)
				continue
			}

			// TODO: better content type detection
			fileContentType := "application/octet-stream"
			ext := filepath.Ext(file.Name)
			switch ext {
			case ".txt":
				fileContentType = "text/plain"
			case ".md":
				fileContentType = "text/markdown"
			case ".html":
				fileContentType = "text/html"
			case ".json":
				fileContentType = "application/json"
			case ".pdf":
				fileContentType = "application/pdf"
			}

			result, err := u.processFile(ctx, workspaceID, file.Name, fileContentType, contentBytes)
			if err != nil {
				slog.Warn("failed to process file in zip", "filename", file.Name, "err", err)
				continue
			}
			if primaryResult == nil {
				primaryResult = result
			}
		}

		if primaryResult == nil {
			return nil, fmt.Errorf("no processable files found in zip archive")
		}
		// Return the topic of the first file as the main one
		return primaryResult, nil

	} else {
		return u.processFile(ctx, workspaceID, filename, contentType, data)
	}
}

// CompleteUpload is called after a client-side presign upload to GCS.
// It records the input in Firestore and publishes the media.received event.
func (u *UploadUsecase) CompleteUpload(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	objectKey string,
	filename string,
	contentType string,
	sizeBytes int64,
) (*domain.UploadResult, error) {
	if _, err := u.authVerifier.VerifyToken(ctx, authHeader); err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	if workspaceID == "" {
		return nil, fmt.Errorf("workspace_id is required")
	}
	if !strings.HasPrefix(objectKey, "mind/inputs/") {
		return nil, fmt.Errorf("invalid object_key")
	}

	// Derive inputID from object key: mind/inputs/{inputID}.raw
	base := path.Base(objectKey)
	inputID := strings.TrimSuffix(base, ".raw")
	if inputID == "" || inputID == base {
		return nil, fmt.Errorf("cannot derive inputId from object_key %q", objectKey)
	}

	gcsURI := fmt.Sprintf("gs://%s/%s", u.storage.BucketName(), objectKey)

	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if filename == "" {
		filename = base
	}

	input := domain.UploadInput{
		InputID:          inputID,
		WorkspaceID:      workspaceID,
		ContentType:      contentType,
		OriginalFilename: filename,
		SizeBytes:        sizeBytes,
	}
	if err := u.inputRecorder.RecordInput(ctx, input, gcsURI, ""); err != nil {
		return nil, fmt.Errorf("firestore record: %w", err)
	}
	slog.Info("recorded input in Firestore (presign complete)", "inputId", inputID, "workspaceId", workspaceID)

	topicID := "topic:" + inputID
	idempotencyKey := fmt.Sprintf("type:media.received/topicId:%s/inputId:%s", topicID, inputID)
	if err := u.publisher.Publish(ctx, "media.received", workspaceID, topicID, idempotencyKey, map[string]string{
		"inputId":     inputID,
		"workspaceId": workspaceID,
		"topicId":     topicID,
		"rawRef":      gcsURI,
		"contentType": contentType,
	}); err != nil {
		slog.Error("pubsub publish failed (non-fatal)", "inputId", inputID, "err", err)
	} else {
		slog.Info("published media.received event (presign complete)", "inputId", inputID)
	}

	return &domain.UploadResult{
		InputID: inputID,
		TopicID: topicID,
		GCSUri:  gcsURI,
		Status:  "uploaded",
	}, nil
}

func (u *UploadUsecase) DownloadInput(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	inputID string,
) (*domain.DownloadResult, error) {
	// 1. Auth verification
	_, err := u.authVerifier.VerifyToken(ctx, authHeader)
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}

	// 2. Retrieve metadata from Firestore
	detail, err := u.inputRecorder.GetInput(ctx, workspaceID, inputID)
	if err != nil {
		return nil, fmt.Errorf("get input: %w", err)
	}

	// 3. Download from GCS
	if detail.GCSUri == "" {
		return nil, fmt.Errorf("no GCS URI found for input")
	}

	data, err := u.storage.Download(ctx, detail.GCSUri)
	if err != nil {
		return nil, fmt.Errorf("storage download: %w", err)
	}

	return &domain.DownloadResult{
		Content:     data,
		ContentType: detail.ContentType,
		Filename:    detail.OriginalFilename,
	}, nil
}

func (u *UploadUsecase) processFile(
	ctx context.Context,
	workspaceID string,
	filename string,
	contentType string,
	data []byte,
) (*domain.UploadResult, error) {
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
	idempotencyKey := fmt.Sprintf("type:media.received/topicId:%s/inputId:%s", topicID, inputID)
	err = u.publisher.Publish(ctx, "media.received", workspaceID, topicID, idempotencyKey, map[string]string{
		"inputId":     inputID,
		"workspaceId": workspaceID,
		"topicId":     topicID,
		"rawRef":      gcsURI,
		"contentType": contentType,
	})
	if err != nil {
		// Non-fatal: log error but still return success to user.
		slog.Error("pubsub publish failed (non-fatal)", "inputId", inputID, "err", err)
	} else {
		slog.Info("published media.received event", "inputId", inputID)
	}

	return &domain.UploadResult{
		InputID: inputID,
		TopicID: topicID,
		GCSUri:  gcsURI,
		Status:  "uploaded",
	}, nil
}

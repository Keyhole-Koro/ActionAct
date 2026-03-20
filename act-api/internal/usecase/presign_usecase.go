package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"act-api/internal/adapter"
	"act-api/internal/domain"
)

const presignTTL = 30 * time.Minute

// PresignUsecase generates a pre-signed upload URL and the resulting GCS object key.
type PresignUsecase struct {
	authVerifier      domain.AuthVerifier
	storage           *adapter.GCSStorage
	uploadProxyOrigin string // non-empty → return proxy URL instead of signed URL (local dev)
}

func NewPresignUsecase(
	authVerifier domain.AuthVerifier,
	storage *adapter.GCSStorage,
	uploadProxyOrigin string,
) *PresignUsecase {
	return &PresignUsecase{
		authVerifier:      authVerifier,
		storage:           storage,
		uploadProxyOrigin: uploadProxyOrigin,
	}
}

type PresignResult struct {
	ObjectKey string
	UploadURL string
	ExpiresAt time.Time
}

// Execute verifies auth, generates an input ID and returns an upload URL.
func (uc *PresignUsecase) Execute(
	ctx context.Context,
	authHeader string,
	workspaceID string,
	mimeType string,
) (*PresignResult, error) {
	if _, err := uc.authVerifier.VerifyToken(ctx, authHeader); err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	if workspaceID == "" {
		return nil, fmt.Errorf("workspace_id is required")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	inputID := "in_" + uuid.New().String()[:8]
	objectKey := fmt.Sprintf("mind/inputs/%s.raw", inputID)
	expiresAt := time.Now().Add(presignTTL)

	var uploadURL string
	if uc.uploadProxyOrigin != "" {
		// Local dev: route upload through act-api proxy so we avoid GCS emulator CORS issues.
		uploadURL = fmt.Sprintf("%s/api/upload/stream?key=%s", uc.uploadProxyOrigin, objectKey)
	} else {
		var err error
		uploadURL, err = uc.storage.PresignedPutURL(objectKey, mimeType, presignTTL)
		if err != nil {
			return nil, fmt.Errorf("presign: %w", err)
		}
	}

	return &PresignResult{
		ObjectKey: objectKey,
		UploadURL: uploadURL,
		ExpiresAt: expiresAt,
	}, nil
}

package adapter

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"

	"cloud.google.com/go/storage"
)

// GCSStorage uploads objects to Google Cloud Storage.
type GCSStorage struct {
	client     *storage.Client
	bucketName string
}

// NewGCSStorage creates a GCSStorage backed by the given bucket.
func NewGCSStorage(client *storage.Client, bucketName string) *GCSStorage {
	return &GCSStorage{client: client, bucketName: bucketName}
}

// Upload writes data to GCS at the specified objectPath and returns the full
// GCS URI, the object generation, and the SHA-256 hex digest of the content.
func (s *GCSStorage) Upload(ctx context.Context, objectPath string, data []byte, contentType string) (gcsURI string, generation int64, sha256Hex string, err error) {
	obj := s.client.Bucket(s.bucketName).Object(objectPath)
	w := obj.NewWriter(ctx)
	w.ContentType = contentType

	if _, err = w.Write(data); err != nil {
		_ = w.Close()
		return "", 0, "", fmt.Errorf("gcs write: %w", err)
	}
	if err = w.Close(); err != nil {
		return "", 0, "", fmt.Errorf("gcs close: %w", err)
	}

	attrs, err := obj.Attrs(ctx)
	if err != nil {
		return "", 0, "", fmt.Errorf("gcs attrs: %w", err)
	}

	h := sha256.New()
	_, _ = io.WriteString(h, string(data))
	digest := fmt.Sprintf("%x", h.Sum(nil))

	uri := fmt.Sprintf("gs://%s/%s", s.bucketName, objectPath)
	return uri, attrs.Generation, digest, nil
}

// Close releases the underlying storage client.
func (s *GCSStorage) Close() error {
	return s.client.Close()
}

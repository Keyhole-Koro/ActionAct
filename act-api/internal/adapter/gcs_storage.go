package adapter

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"strings"

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
	fmt.Printf("[GCS DEBUG] Uploading %s to bucket %s (size: %d)\n", objectPath, s.bucketName, len(data))
	obj := s.client.Bucket(s.bucketName).Object(objectPath)
	w := obj.NewWriter(ctx)
	w.ContentType = contentType
	w.ChunkSize = 0 // Disable resumable uploads for emulator compatibility

	if n, err := w.Write(data); err != nil {
		fmt.Printf("[GCS DEBUG] Write failed: %v\n", err)
		_ = w.Close()
		return "", 0, "", fmt.Errorf("gcs write: %w", err)
	} else {
		fmt.Printf("[GCS DEBUG] Wrote %d bytes\n", n)
	}

	if err = w.Close(); err != nil {
		fmt.Printf("[GCS DEBUG] Close failed: %v\n", err)
		return "", 0, "", fmt.Errorf("gcs close: %w", err)
	}

	attrs, err := obj.Attrs(ctx)
	if err != nil {
		fmt.Printf("[GCS DEBUG] Attrs failed: %v\n", err)
		return "", 0, "", fmt.Errorf("gcs attrs: %w", err)
	}

	h := sha256.New()
	_, _ = io.WriteString(h, string(data))
	digest := fmt.Sprintf("%x", h.Sum(nil))

	uri := fmt.Sprintf("gs://%s/%s", s.bucketName, objectPath)
	fmt.Printf("[GCS DEBUG] Upload SUCCESS: %s\n", uri)
	return uri, attrs.Generation, digest, nil
}

// Download retrieves the content of an object from GCS.
func (s *GCSStorage) Download(ctx context.Context, gcsURI string) ([]byte, error) {
	// Parse gs://bucket/path
	if !strings.HasPrefix(gcsURI, "gs://") {
		return nil, fmt.Errorf("invalid GCS URI: %s", gcsURI)
	}
	parts := strings.SplitN(strings.TrimPrefix(gcsURI, "gs://"), "/", 2)
	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid GCS URI format: %s", gcsURI)
	}
	bucketName, objectPath := parts[0], parts[1]

	rc, err := s.client.Bucket(bucketName).Object(objectPath).NewReader(ctx)
	if err != nil {
		return nil, fmt.Errorf("gcs new reader: %w", err)
	}
	defer rc.Close()

	data, err := io.ReadAll(rc)
	if err != nil {
		return nil, fmt.Errorf("read gcs object: %w", err)
	}
	return data, nil
}

// Close releases the underlying storage client.
func (s *GCSStorage) Close() error {
	return s.client.Close()
}

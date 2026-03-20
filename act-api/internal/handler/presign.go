package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"act-api/internal/adapter"
	"act-api/internal/usecase"
)

// PresignHandler handles:
//   - POST /api/upload/presign  → returns a signed (or proxy) upload URL
//   - PUT  /api/upload/stream   → proxies the request body to GCS (local dev only)
type PresignHandler struct {
	uc      *usecase.PresignUsecase
	storage *adapter.GCSStorage
}

func NewPresignHandler(uc *usecase.PresignUsecase, storage *adapter.GCSStorage) *PresignHandler {
	return &PresignHandler{uc: uc, storage: storage}
}

func (h *PresignHandler) Register(mux *http.ServeMux) {
	mux.Handle("/api/upload/presign", http.HandlerFunc(h.ServePresign))
	mux.Handle("/api/upload/stream", http.HandlerFunc(h.ServeStream))
}

// ServePresign handles POST /api/upload/presign.
func (h *PresignHandler) ServePresign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		WorkspaceID string `json:"workspace_id"`
		MimeType    string `json:"mime_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	result, err := h.uc.Execute(r.Context(), r.Header.Get("Authorization"), body.WorkspaceID, body.MimeType)
	if err != nil {
		slog.Error("presign failed", "err", err)
		http.Error(w, "presign failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"object_key": result.ObjectKey,
		"upload_url": result.UploadURL,
		"expires_at": result.ExpiresAt.UTC().Format("2006-01-02T15:04:05Z"),
	})
}

// ServeStream handles PUT /api/upload/stream?key={objectKey}.
// Used only in local dev (UPLOAD_PROXY_ORIGIN is set) so the browser can upload
// to act-api which streams directly to the GCS emulator.
func (h *PresignHandler) ServeStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	objectKey := r.URL.Query().Get("key")
	if objectKey == "" {
		http.Error(w, "key query param is required", http.StatusBadRequest)
		return
	}
	// Restrict to the uploads prefix to prevent writing arbitrary paths.
	if len(objectKey) < 12 || objectKey[:12] != "mind/inputs/" {
		http.Error(w, "invalid key", http.StatusBadRequest)
		return
	}

	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err := h.storage.UploadStream(r.Context(), objectKey, r.Body, contentType)
	if err != nil {
		slog.Error("stream upload failed", "key", objectKey, "err", err)
		http.Error(w, "upload failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

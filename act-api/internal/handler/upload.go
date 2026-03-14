package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"act-api/internal/usecase"
)

const maxUploadSize = 50 << 20 // 50 MB

// UploadHandler serves POST /api/upload for multipart file uploads.
type UploadHandler struct {
	uc *usecase.UploadUsecase
}

// NewUploadHandler creates a handler backed by the upload usecase.
func NewUploadHandler(uc *usecase.UploadUsecase) *UploadHandler {
	return &UploadHandler{uc: uc}
}

// ServeHTTP handles the multipart upload request.
func (h *UploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form with size limit
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		slog.Warn("upload parse failed", "err", err)
		http.Error(w, "file too large or invalid form", http.StatusBadRequest)
		return
	}

	// Required: workspace_id
	workspaceID := r.FormValue("workspace_id")
	if workspaceID == "" {
		http.Error(w, "workspace_id is required", http.StatusBadRequest)
		return
	}

	// Required: file
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file field is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		slog.Error("read file failed", "err", err)
		http.Error(w, "failed to read file", http.StatusInternalServerError)
		return
	}

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Extract auth header
	authHeader := r.Header.Get("Authorization")

	result, err := h.uc.Execute(r.Context(), authHeader, workspaceID, header.Filename, contentType, data)
	if err != nil {
		slog.Error("upload execute failed", "err", err, "workspaceId", workspaceID)
		http.Error(w, "upload failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"input_id": result.InputID,
		"status":   result.Status,
	})
}

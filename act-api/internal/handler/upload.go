package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"act-api/internal/usecase"
)

const maxCompleteBodySize = 4 << 10 // 4 KB

const maxUploadSize = 50 << 20 // 50 MB

// UploadHandler serves file uploads and downloads.
type UploadHandler struct {
	uc *usecase.UploadUsecase
}

// NewUploadHandler creates a handler backed by the upload usecase.
func NewUploadHandler(uc *usecase.UploadUsecase) *UploadHandler {
	return &UploadHandler{uc: uc}
}

// Register routes this handler to the given mux.
func (h *UploadHandler) Register(mux *http.ServeMux) {
	mux.Handle("/api/upload", http.HandlerFunc(h.ServeUpload))
	mux.Handle("/api/upload/complete", http.HandlerFunc(h.ServeComplete))
	mux.Handle("/api/workspaces/", http.HandlerFunc(h.ServeDownload))
}

// ServeUpload handles POST /api/upload.
func (h *UploadHandler) ServeUpload(w http.ResponseWriter, r *http.Request) {
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
		"topic_id": result.TopicID,
		"status":   result.Status,
	})
}

// ServeComplete handles POST /api/upload/complete.
// Called by the client after a presign PUT upload has finished.
// Body: JSON { workspace_id, object_key, filename, content_type, size_bytes }
func (h *UploadHandler) ServeComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxCompleteBodySize)
	var req struct {
		WorkspaceID string `json:"workspace_id"`
		ObjectKey   string `json:"object_key"`
		Filename    string `json:"filename"`
		ContentType string `json:"content_type"`
		SizeBytes   int64  `json:"size_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	authHeader := r.Header.Get("Authorization")
	result, err := h.uc.CompleteUpload(r.Context(), authHeader, req.WorkspaceID, req.ObjectKey, req.Filename, req.ContentType, req.SizeBytes)
	if err != nil {
		slog.Error("complete upload failed", "err", err, "workspaceId", req.WorkspaceID)
		http.Error(w, "upload complete failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"input_id": result.InputID,
		"topic_id": result.TopicID,
		"status":   result.Status,
	})
}

// ServeDownload handles GET /api/workspaces/{workspaceId}/inputs/{inputId}/raw.
func (h *UploadHandler) ServeDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Path: /api/workspaces/{workspaceId}/inputs/{inputId}/raw
	// We'll use a simple split for now since act-api uses standard ServeMux.
	parts := PathParts(r.URL.Path)
	if len(parts) < 6 || parts[2] != "inputs" || parts[4] != "raw" {
		http.NotFound(w, r)
		return
	}
	workspaceID := parts[1]
	inputID := parts[3]

	authHeader := r.Header.Get("Authorization")
	result, err := h.uc.DownloadInput(r.Context(), authHeader, workspaceID, inputID)
	if err != nil {
		slog.Error("download failed", "err", err, "workspaceId", workspaceID, "inputId", inputID)
		http.Error(w, "download failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("Content-Disposition", "inline; filename=\""+result.Filename+"\"")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result.Content)
}

output "frontend_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "フロントエンドの公開 URL"
}

output "artifact_registry_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/action"
  description = "Artifact Registry リポジトリのパス"
}
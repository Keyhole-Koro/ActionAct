locals {
  image = "${var.region}-docker.pkg.dev/${var.project_id}/action/frontend:${var.image_tag}"
}

# 必要な API を有効化
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# コンテナイメージ用 Artifact Registry リポジトリ
resource "google_artifact_registry_repository" "action" {
  location      = var.region
  repository_id = "action"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# Cloud Run 用サービスアカウント
resource "google_service_account" "frontend" {
  account_id   = "frontend-sa"
  display_name = "Frontend Cloud Run Service Account"
}

# Cloud Run サービス (frontend)
resource "google_cloud_run_v2_service" "frontend" {
  name     = "frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend.email

    containers {
      image = local.image

      ports {
        container_port = 3000
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        startup_cpu_boost = true
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }
  }

  depends_on = [google_project_service.apis]
}

# 一般公開（認証なしアクセスを許可）
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
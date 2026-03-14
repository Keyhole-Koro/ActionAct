terraform {
  required_version = ">= 1.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  # 本番運用では backend "gcs" を推奨
  # backend "gcs" {
  #   bucket = "<YOUR_STATE_BUCKET>"
  #   prefix = "terraform/action/frontend"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
variable "project_id" {
  type        = string
  description = "Google Cloud Project ID"
}

variable "region" {
  type        = string
  default     = "asia-northeast1"
  description = "デプロイリージョン"
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "デプロイするコンテナイメージのタグ"
}

variable "use_mocks" {
  type        = string
  default     = "true"
  description = "NEXT_PUBLIC_USE_MOCKS のビルド引数値"
}
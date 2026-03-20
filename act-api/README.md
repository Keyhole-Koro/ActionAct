# ActionAct Act API

Go で実装された `act-api` です。

## Scripts

```bash
go test ./...
go run ./cmd/act-api
```

## Environment

起動時に必須環境変数を検証します。missing や空文字では起動しません。

Required:

* `PORT`
* `REDIS_ADDR`
* `REDIS_DB`
  * integer
* `CORS_ALLOWED_ORIGINS`
* `ACT_ADK_WORKER_URL`
* `GOOGLE_CLOUD_PROJECT`
* `GCS_BUCKET`
* `DISCORD_APPLICATION_ID`
* `SID_STRICT`
  * `true` or `false`
* `SID_TTL_SECONDS`
  * integer
* `CSRF_TTL_SECONDS`
  * integer
* `SID_REQ_TTL_SECONDS`
  * integer
* `SID_LOCK_TTL_SECONDS`
  * integer

Example:

```bash
PORT=8080 \
REDIS_ADDR=localhost:6379 \
REDIS_DB=0 \
CORS_ALLOWED_ORIGINS=http://localhost:3000 \
ACT_ADK_WORKER_URL=http://localhost:8000 \
GOOGLE_CLOUD_PROJECT=local-dev \
GCS_BUCKET=local-dev-bucket \
DISCORD_APPLICATION_ID=123456789012345678 \
SID_STRICT=true \
SID_TTL_SECONDS=86400 \
CSRF_TTL_SECONDS=86400 \
SID_REQ_TTL_SECONDS=900 \
SID_LOCK_TTL_SECONDS=10 \
go run ./cmd/act-api
```

## Main Responsibilities

* `RunAct` の認証付き API 境界
* upload API
  * `/api/upload/presign`
  * `/api/upload/complete`
* workspace 操作
  * rename
  * visibility
  * member add / search
* Discord integration
  * invite URL 発行
  * install session 作成 / 参照 / confirm

## Auth Session Bootstrap

`RunAct` の前に `Authorization: Bearer <Firebase ID token>` を使って
`POST /auth/session/bootstrap` を呼び、`sid` と `csrf_token` cookie を発行する前提です。

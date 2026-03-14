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
* `ACT_ADK_WORKER_URL`
* `GOOGLE_CLOUD_PROJECT`
* `SID_STRICT`
  * `true` or `false`
* `SID_REQ_TTL_SECONDS`
  * integer
* `SID_LOCK_TTL_SECONDS`
  * integer

Example:

```bash
PORT=8080 \
REDIS_ADDR=localhost:6379 \
REDIS_DB=0 \
ACT_ADK_WORKER_URL=http://localhost:8000 \
GOOGLE_CLOUD_PROJECT=local-dev \
SID_STRICT=true \
SID_REQ_TTL_SECONDS=900 \
SID_LOCK_TTL_SECONDS=10 \
go run ./cmd/act-api
```

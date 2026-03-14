# ActionAct ADK Worker

FastAPI で動く Act worker です。

## Context Assembly

`RunAct` 実行時は Firestore を read-only で参照し、少なくとも次を prompt context に束ねます。

* `topics/{topicId}` の topic summary
* `outlines/{latestOutlineVersion}` と `drafts/{latestDraftVersion}`
* focus node と neighbor node
* `nodes/{nodeId}/evidence/*`
* `actRuns/*` の recent history

Firestore 取得に失敗した場合は、仕様どおり minimal bundle に degrade して応答生成だけは継続します。

## Runtime Modes

* `GOOGLE_API_KEY` を設定すると Gemini Developer API を使います
* `GOOGLE_API_KEY` が無く `VERTEX_USE_REAL_API=true` のときは Vertex AI Gemini を使います
* どちらも無い場合は mock LLM を使います

## Docker Compose

root の `compose.yaml` は `GOOGLE_API_KEY` をそのまま `act-adk-worker` に渡します。
Gemini AI Studio の key を使うときは、compose 起動前に shell で export してください。

```bash
export GOOGLE_API_KEY=your-gemini-ai-studio-key
docker compose up -d --force-recreate act-adk-worker act-api frontend
```

この compose 設定では `VERTEX_USE_REAL_API=false` なので、`GOOGLE_API_KEY` が入っていれば
Vertex ではなく Gemini Developer API が選ばれます。

## Example

Gemini Developer API:

```bash
PORT=8000 \
GOOGLE_API_KEY=your-google-api-key \
GOOGLE_CLOUD_PROJECT=local-dev \
VERTEX_USE_REAL_API=false \
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Vertex AI:

```bash
PORT=8000 \
GOOGLE_CLOUD_PROJECT=your-gcp-project \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
VERTEX_USE_REAL_API=true \
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

# ActionAct ADK Worker

FastAPI で動く Act worker です。

## Runtime Modes

* `GOOGLE_API_KEY` を設定すると Gemini Developer API を使います
* `GOOGLE_API_KEY` が無く `VERTEX_USE_REAL_API=true` のときは Vertex AI Gemini を使います
* どちらも無い場合は mock LLM を使います

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

# Act - Execution Layer

`ActionAct` は、整理済みの知識を使ってユーザー操作に応答する実行層です。

主な構成:

* `frontend`
  * Next.js SPA
  * graph UI, Act 実行 UI, upload UI, Discord connect UI を担当します
* `act-api`
  * 認証済み session を前提にした API 境界です
  * RunAct, upload, workspace 操作, Discord integration を受け持ちます
* `act-adk-worker`
  * LLM 実行 runtime です
  * Firestore / GCS から context を組み立て、保存済み Discord ログも参照できます

関連資料:

* Frontend 仕様: [frontend-spec.md](./frontend/frontend-spec.md)
* Act API: [README.md](./act-api/README.md)
* ADK Worker: [README.md](./act-adk-worker/README.md)

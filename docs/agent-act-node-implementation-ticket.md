# Agent Act Node Implementation Ticket

この文書は、`RunAct` 内の search subflow を現在の `ActionAct` 実装に馴染む形で `agent act node` として導入するための実装チケットを定義する。

## 実装前提

現在の `ActionAct` frontend / act draft 実装は次の形を前提にする。

* graph store は `addOrUpdateActNode()` で `kind`, `parentId`, `createdBy`, `usedTools`, `usedSources`, `referencedNodeIds` を扱える
* act draft Firestore は `workspaces/{workspaceId}/actDrafts/{nodeId}` を正本として `kind`, `parentId`, `contentMd`, `thoughtMd` を保存している
* Act stream patch は `PatchOp` で `kind`, `parentId`, `contentMd`, `thoughtMd`, `usedTools`, `usedSources` を frontend に渡せる
* graph の親子接続は明示 edge event ではなく `parentId` を使う実装にすでに馴染んでいる

この前提から、以下を設計方針として固定する。

* search subflow の可視化は新しい専用 node 系ではなく `agent act node` として act draft 上に表現する
* `agent act node` の `kind` は `"agent_act"` とする
* 親子接続は既存どおり `parentId` で表現する
* child node の role は `agentRole` に持たせる
* child node の進行状態は `status` に持たせる
* 初期対象の subflow は `search` のみとする

## 現状差分

現在の実装には次の差分がある。

* `PatchOp` に `status`, `agentRole` がない
* graph node data に `status`, `agentRole` がない
* act draft Firestore 読み書きに `status`, `agentRole` がない
* `ActNodeData` は `kind: "act"` 固定で、`"agent_act"` を型として許容していない
* `RunAct` は child agent node を生成せず、検索 subflow の可視化契約がない

## 目的

* built-in search を親 RunAct の直接 tool として見せず、worker 内の search subflow に分離する
* その search subflow を graph 上で `agent act node` として可視化する
* `suggest_deep_dives` / `start_act` の function tool 契約は親 RunAct 側で維持する
* child node の生成・更新・完了・失敗が stream と Firestore に一貫して残るようにする

## 実装順

1. T1 データ契約拡張
2. T2 Frontend graph / draft 対応
3. T3 Search subflow orchestration
4. T4 UI 表示
5. T5 Fail-open / telemetry / rollout

この順を固定する理由:

* 先に `status` / `agentRole` の契約を固めないと worker と frontend の実装がずれる
* graph / Firestore で `agent_act` が読めない状態で worker を先に変えると patch が死蔵する
* search subflow を先に入れると、child node の表示不整合が混ざって原因切り分けが難しくなる

## T1. データ契約拡張

目的:

* `agent act node` を stream / graph / Firestore で一貫して扱えるようにする

対象:

* `frontend/src/services/act/port.ts`
* `frontend/src/features/graph/types.ts`
* `frontend/src/services/actDraft/firestore.ts`
* `frontend/src/features/graph/store.ts`
* 必要なら Connect schema / backend patch contract

作業内容:

* `PatchOp.data` に次を追加する
  * `status: "running" | "completed" | "failed"`
  * `agentRole: "search"`
* graph node data に `status`, `agentRole` を追加する
* `kind` として `"agent_act"` を許容する
* Firestore read/write で `status`, `agentRole` を保存・読込する

設計メモ:

* `agentRole` は初期版では `"search"` のみ許容でよい
* `status` は child node 専用ではなく、将来 `act` 本体にも流用できる形で持ってよい
* parent-child edge は新設しない

DoD:

* `PatchOp` に `status`, `agentRole` を載せられる
* Firestore `actDrafts` に `status`, `agentRole` が保存される
* graph 型が `kind: "agent_act"` を許容する
* `parentId` だけで child node を既存 graph に乗せられる

依存:

* なし

## T2. Frontend graph / draft 対応

目的:

* `agent act node` を現在の graph / draft 実装に馴染ませる

対象:

* `frontend/src/features/graph/store.ts`
* `frontend/src/features/graph/runtime/act-graph-actions.ts`
* `frontend/src/services/actDraft/firestore.ts`
* `frontend/src/features/graph/selectors/*`

作業内容:

* `addOrUpdateActNode()` が `status`, `agentRole` を取り込めるようにする
* draft 保存時に `agent_act` の metadata を欠落させない
* `parentId` に基づく既存階層表示で child node が自然にぶら下がることを確認する
* `referencedNodeIds`, `usedSources` が `agent_act` にも残るようにする

設計メモ:

* まずは明示 edge を増やさず、既存の hierarchy / orbit / radial projection を再利用する
* child node の layout は親の近傍表示で十分とし、専用 layout は後回しにする

DoD:

* `agent_act` node を store に入れても既存 graph が壊れない
* Firestore から再読込しても `status`, `agentRole`, `parentId` が維持される
* child node が親 node の子として既存 UI に馴染む

依存:

* T1

## T3. Search Subflow Orchestration

目的:

* built-in search を親 RunAct の直接 tool から外し、search subflow として分離する

対象:

* `act-adk-worker/app/usecase/run_act.py`
* `act-adk-worker/app/adapter/gemini_llm.py`
* child node patch を emit する backend layer

作業内容:

* 親 RunAct は custom function tool を維持する
* 検索が必要な場合は worker 内で search subflow を起動する
* search subflow 開始時に child `agent_act` node を `status=running`, `agentRole=search` で作成する
* 進捗・検索クエリ・要約・ソース一覧を child node に追記する
* 完了時に `status=completed` と `usedSources` を確定する
* 失敗時に `status=failed` を確定する
* 親 RunAct は child の要約を context として受け取り、本文生成を継続する

設計メモ:

* 初期版では search subflow は worker 内の専用処理として実装し、ADK の agent graph 導入は後回しにする
* child node 作成時の `parentId` は親 act node id と一致させる
* child node の `createdBy` は `"agent"` 固定でよい

DoD:

* search 実行時に child `agent_act` node が生成される
* child node に query / summary / sources が残る
* 親 RunAct は child 結果を使って生成を継続できる
* `suggest_deep_dives` / `start_act` が本文化せず function tool として維持される

依存:

* T1
* T2

## T4. UI 表示

目的:

* `agent act node` を graph 上で人が理解できる形で表示する

対象:

* `frontend/src/features/graph/components/*`
* `frontend/src/features/nodeDetail/components/*`
* 検索結果表示まわり

作業内容:

* `kind === "agent_act"` の visual treatment を追加する
* `agentRole` badge を表示する
* `status` badge を表示する
* child node の本文に query / summary / source links を読める形で出す

設計メモ:

* 初期 role は `search` だけなので icon / badge は過度に一般化しなくてよい
* `agent_act` は通常の `act` と似せつつ、補助 node と分かる見た目にする

DoD:

* `agent_act` が通常の `act` と識別できる
* `running/completed/failed` が見える
* source link が node detail から辿れる

依存:

* T2

## T5. Fail-open / Telemetry / Rollout

目的:

* search subflow 失敗時の user impact を抑えつつ、観測可能にする

対象:

* worker logging
* frontend telemetry
* rollout docs

作業内容:

* search child 失敗時の方針を fail-open にする
* child node に失敗理由を残す
* 親 RunAct は検索なしで続行する
* trace / requestId を親子で相互参照できるようにする

設計メモ:

* 初期版では child failure で親全体を止めない
* ただし user-facing に「検索に失敗した」ことは child node 上で見えるようにする

DoD:

* search child が失敗しても親 RunAct は継続できる
* child node に `status=failed` とエラー概要が残る
* trace で親子の関連が追える

依存:

* T3

## 仕様差分として明示更新が必要な点

このチケットは次の仕様差分を伴うため、実装時は関連正本も更新する。

* `frontend/frontend-spec.md`
  * `agent act node` の位置づけ
  * graph 上の親子表現
* Firestore schema 正本
  * `actDrafts` に `status`, `agentRole` を追加
* Act stream / patch 契約
  * `PatchOp` に `status`, `agentRole` を追加

## 未解決事項

次は実装前に人間確認を入れる。

* `agentRole` の enum を初期版で `"search"` のみに固定するか
* `status` を `agent_act` 以外にも使うか
* child node の source summary 形式を Markdown 本文だけで持つか、専用 field を追加するか

# Frontend 仕様（SPA / Next.js / Mock Factory）

本ドキュメントはハッカソン開発中プロジェクト向けのフロント仕様を定義する。
目的は「知識を抽象↔具体の階層ノードにして、情報アクセスを速くする」こと。
フロントは **Act（Connect RPC）** と **Organize（Firestore snapshot）** を境界として分離する。
さらに、**モック駆動でデモできるように Factory を用意**し、バックエンド/FirestoreなしでもUIが成立する開発体験を提供する。

---

### アプリ形態（必須前提）

* **SPA（単一画面）**として実装する（画面遷移を前提にしない）
* **Next.js（App Router） + TypeScript** を使用する（ただし実体は単一ページSPA）

---

### 採用ライブラリ（確定）

* reactflow
* elkjs
* Tailwind CSS
* shadcn/ui（Radix）
* Zustand
* react-markdown
* remark-gfm
* rehype-sanitize
* sonner
* firebase（Auth + Firestore）
* @connectrpc/connect / @connectrpc/connect-web

#### 「使うかも」メモ（今回は依存に入れないが、拡張余地は残す）

* cmdk / react-hotkeys-hook / fuse.js / nanoid

---

## UIリソース（デザイン実装で積極利用）

アイコン・アニメーション・UI部品は以下を優先的に参照して実装する。
MVPでは「独自SVGを最小化し、既存ライブラリ資産を多用する」。

### アイコン

* Lucide Icons: https://lucide.dev/icons/
* Lucide static SVG: https://app.unpkg.com/lucide-static@0.563.0/files/icons
* Tabler Icons: https://tabler.io/icons
* Tabler 個別アイコン例: https://tabler.io/icons/icon/copy
* Tabler Icons viewer: https://tablericons.com/

### アニメーション

* LottieFiles（free animations）: https://lottiefiles.com/free-animations/link

### グラフ/UI実装参考

* React Flow examples: https://reactflow.dev/examples
* React Flow example apps: https://github.com/xyflow/react-flow-example-apps
* D3: https://d3js.org/
* D3 gallery: https://observablehq.com/@d3/gallery
* shadcn/ui components: https://ui.shadcn.com/docs/components
* Radix UI primitives: https://www.radix-ui.com/primitives
* Vercel AI SDK intro: https://ai-sdk.dev/docs/introduction
* Vercel AI SDK docs: https://vercel.com/docs/ai-sdk

### 運用ルール（MUST）

* アイコンは Lucide / Tabler を第一候補にする
* 1画面内で icon style を混在させる場合は、線幅とサイズ基準（例: 16/20/24）を統一する
* 状態表現をアイコンのみに依存しない（テキスト/色/ラベルを併記）

---

### 技術的注意（Next.js絡みの詰まり回避）

* Firestore `onSnapshot` / Firebase Auth / ReactFlow / RPC呼び出しは基本 **クライアント側で動かす**

  * これらを含むコンポーネント/フックは **Client Component** として実装し、必要箇所に `use client` を付ける
* ReactFlowはSSRと相性問題が出る可能性があるため、詰まり回避として **dynamic import（`ssr:false`）の使用を許容**

---

## 機能ユニット（境界）

* **Act**：Connect RPCで探索/相談→短期 `actDrafts` snapshot を保持しつつ「ノード候補・タグ・引用リンク・結論と理由」
  * `context_node_ids` または `anchor_node_id` を伴う ACT node は、カードタイトル下に `Referenced From` の軽量 chips を表示してよい
  * この表示は frontend draft continuity の範囲で扱い、知識正本の relation を新設したものとして扱わない
* **Organize**：Firestore snapshotでツリー購読 + CRUD（rename/delete/move/merge）

### 補助仕様

* `frontend/specs/upload-progress.md`
* `frontend/specs/topic-activity.md`
* `frontend/specs/node-detail.md`
* `frontend/specs/review-inbox.md`
* `frontend/specs/graph-node-design.md`

---

## 画面/体験（MVP）

* 左：ノードツリー（検索、折りたたみ、ピン留め）※主表示はReactFlow
* 操作：最低限「削除・リネーム」。余裕があれば「move」「merge」

### MVPレイアウト規約

* `>=1280px`: 左ペイン / キャンバスの2カラム
* `>=768px && <1280px`: 左ペインを縮小し、キャンバスを主表示する
* `<768px`: キャンバスを主表示とし、補助 UI は overlay とする

### OrganizeイベントのUI露出

MVP では Organize の内部状態を完全には見せなくてよいが、次の6つは UI 契約として持つ。

0. Upload processing progress
* フロントから投入した input について、処理がどこまで進んだかを段階表示する
* 内部 event をそのまま見せず、ユーザー向けの `upload status` へ射影して表示する
* 正本は Firestore `workspaces/{workspaceId}/topics/{topicId}/inputProgress/{inputId}` とし、フロントは Pub/Sub を直接参照しない
* 少なくとも最新 1 件、可能なら最近 N 件の upload を header または activity panel から追えるようにする

1. TopicResolver 判定
* `resolutionMode`, `resolutionConfidence`, `resolutionReason`, `resolvedTopicId` を input 単位で表示する
* `attach_existing` と `create_new` はバッジで区別する
* confidence は数値そのものより `high / medium / low` 表示を優先してよい

2. Topic activity timeline
* `draft.updated -> bundle.created -> outline.updated` を1本の更新列として表示する
* 1つの input に紐づく draft diff, bundle preview, outline反映結果をまとめて見られるようにする
* A6 の bundle description は timeline 内の preview card として使う

3. Node detail の二層表示
* A7 の `contextSummary` は一覧・カード・Graph 補助表示に使う
* A7 の `detailHtml` は node detail surface の上部サマリーとして使う
* node の canonical 本文が Markdown にある場合は、それを詳細本文として `detailHtml` の下に置く

4. `organizeOps` review inbox
* `planned / approved / applied / dismissed` を扱う review inbox を別導線で持つ
* 通常の node detail 画面に review 操作を混在させない
* MVP では read-only inbox でもよいが、状態バッジと trace は見えるようにする

5. Local inspector
* 開発用に `/inspector` 相当の local-only UI を許容する
* 本番 UI と同じ導線には載せない
* phase preview, Firestore/GCS write preview, event preview を並べて見られる構成にする

### Upload進捗表示

upload 処理は internal event の列を、ユーザー向けの段階へ写像して表示する。

進捗の正本:

* Firestore `workspaces/{workspaceId}/topics/{topicId}/inputProgress/{inputId}`
* フロントは `inputProgress` を snapshot 購読して表示する
* Pub/Sub や event ledger は直接読まない

ユーザー向け status:

* `uploaded`
  * ファイル受理直後
  * `media.received` または input doc 作成直後
* `extracting`
  * A0 が原文抽出中
  * `inputs/{inputId}.status in {received, stored}`
* `atomizing`
  * A1 が atom 生成中
  * `input.received` 後、`atom.created` 前
* `resolving_topic`
  * TopicResolver が attach/create_new を判定中
  * `atom.created` 後、`topic.resolved` 前
* `updating_draft`
  * A2 / A3b / A6 / A3 が topic 更新中
  * `topic.resolved` 後、`outline.updated` 前
* `completed`
  * topic への反映が完了
  * 少なくとも `outline.updated` まで到達
* `failed`
  * retry で吸収できない失敗、またはユーザーに見せるべき長時間停止

表示ルール:

* header には最新 upload 1 件の簡易 progress を出してよい
* 詳細は `topic-activity` 内の upload tracker で表示する
* 進捗は stepper または timeline で表現し、現在 step・完了 step・失敗 step を区別する
* backend の at-least-once retry は UI にそのまま露出せず、同一 step の継続として扱う

表示文言の原則:

* 内部 event 名は primary にしない
* ユーザーには「抽出中」「トピックを判定中」「知識を反映中」のような作業語で出す
* 開発モード時のみ traceId や internal event を補助表示してよい

完了時の表示:

* `completed` では `attached to existing topic` または `created new topic` を結果として出す
* `resolvedTopicId` に対応する topic title が取れるなら、それを primary 表示する
* 反映結果として `draft updated`, `outline updated` の要約を activity timeline に引き渡す

失敗時の表示:

* 長時間処理は warn や error とみなさない
* `failed` は backend が永続失敗を明示した場合のみ表示する
* `failed` では retry 導線か support/debug 情報のどちらかを必ず置く

### SPA画面構成

MVP の SPA は、1画面の中で次の領域に責務を分ける。

1. App header
* auth 状態、Mock/Real バッジ、workspace 名、workspace 作成導線、review inbox 導線を置く
* 開発時のみ inspector への導線を出してよい

2. Left rail
* topic 内の tree/list/search/filter を置く
* node 選択と topic activity への切り替え起点を持つ
* recent uploads への導線を持ってよい

3. Graph canvas
* ReactFlow による主表示
* canvas 上の node は `persisted-node`, `act-draft-node`, `selection-node` の3 class を持つ
* `persisted-node` は Firestore `topics/{topicId}/nodes/{nodeId}` を正本とする
* `act-draft-node` は Firestore `topics/{topicId}/actDrafts/{draftId}` を正本とする
* `selection-node` は frontend 内の一時 UI node であり Firestore 正本を持たない
* node click は node を active にし、node card を展開して detail を読みやすくする
* tree 子ノードの開閉は node 本体クリックではなく、node card 内の chevron control で行う
* chevron click では直下の子ノード群を表示/非表示し、孫以下は親の表示状態に従って従属的に隠れる
* persisted tree の初期表示は root のみでよい
* persisted tree の主レイアウト軸は left-to-right とし、分岐は進行方向に対して上下へ展開する
* persisted tree の親子関係の間に `act-draft-node` / `selection-node` を割り込ませない
* `act-draft-node` は auxiliary lane に置く
* 自動配置の `act-draft-node` は、可能なら `anchor_node_id` / `context_node_ids` / `referencedNodeIds` に対応する参照元ノードの右側 sidecar に寄せ、参照元がない場合のみ general lane に置く
* `act-draft-node` は `created_by` または同等の frontend metadata を持ってよく、node card 上で `user` / `agent` の作成主体アイコンを表示してよい
* `act-draft-node` は current MVP で `Draft` / `Thinking` / `Ready` の簡潔な状態ラベルを持ってよい
* 状態ラベルの意味は以下とする
  * `Draft`: prompt 送信前の下書き状態
  * `Thinking`: request 送信後、streaming 中
  * `Ready`: 最初の応答が返り、内容を読める状態
* expanded した `act-draft-node` は `Draft` 状態のときに限り `Add Media` control を持ってよく、ここから upload した media は current workspace/topic context へ投入してよい
* `selection-node` は overlay layer とし、tree layout 入力には含めない
* `New ACT` は新規 `act-draft-node` を作る主経路とする
* double click は補助操作であり、node 作成の主経路にしない
* canvas は ACT draft nodes を一括で除去する `Clear ACT` control を持つ
* `Clear ACT` は frontend 上の ACT graph state と対応する `actDrafts` をまとめて除去する
* Ask bar の Web Grounding は常設トグルにしない
* grounding 利用は query 内容と act type に応じて runtime が自動判定してよい
* tool / agent / explicit request がある場合のみ grounding 設定を明示 override してよい
* Ask bar は clarification が必要な場合、小さな clarification card を bar 直上に出し、`Continue without context` と `Use selected node and retry` を提供してよい
* clarification が曖昧なノード参照に由来する場合、candidate `selection-node` を canvas 上へ一時表示し、ユーザーが click で選べるようにしてよい
* clarification が broad な UI 参照に由来する場合、`何を知りたいか` の option `selection-node` を canvas 上へ一時表示し、ユーザーが click で選べるようにしてよい
* current MVP では browser-side candidate agent が visible graph を集め、server-side candidate model で候補を解決し、`selection-node` 生成まで自律実行してよい
* candidate model が unavailable な場合に限り、browser-side heuristic ranking へ degrade してよい

4. Node detail
* node detail は常設の独立 pane としては表示しない
* current MVP では node card の展開状態を主 detail surface とする
* `topic-activity` / `review-inbox` は別導線で扱ってよく、canvas 常設 pane には置かない

---

## 重要方針

### Markdown詳細は「固定UIコンポーネント群」を増やさない

node detail は `MarkdownPane` 1つ中心で完結。

* ノード本文は `contentMd` として保持し、`react-markdown + remark-gfm + rehype-sanitize` で描画
* ACT draft node は `referencedNodeIds` を保持してよく、カード上では本文の一部ではなく metadata chips として表示する
* 必要なら `MarkdownEditor` と `MarkdownPreview` を追加して編集/プレビューを分割してよい
* 「根拠」「関連」などは Markdown見出し・箇条書きとして表現（専用UIは作らない）
* `node://` の内部リンクは MarkdownPane 内でリンクレンダリングのみカスタムし、選択ノード変更を実現
* A7 の `detailHtml` は MarkdownPane の代替ではなく、Markdown本文の前に置くサマリー領域として扱う
* `detailHtml` が存在しない場合でも MarkdownPane 単体で成立するようにする

---

### services の設計ルール

* `services/act` と `services/organize` は **インターフェース（port）** を定義する
* `services/act` は Connect RPC 実装を提供する
* `services/organize` は Firestore 実装を提供する
* 例：

  * `services/act/port.ts`（`ActPort` interface）
  * `services/act/index.ts`（RPC 実装の export）
  * `services/organize/port.ts`（`OrganizePort` interface）
  * `services/organize/index.ts`（Firestore 実装の export）

---

## ディレクトリ構成（Next.js App Router想定）

以下の方針で **具体的なディレクトリツリー（ファイル名まで）** を生成せよ。

* `services/act/*`：Connect RPC
* `services/organize/*`：Firestore（snapshot購読）
* Firebase初期化/Authは `services/firebase/*`
* ReactFlowとELKは `features/graph/*`
* 左ペイン統合は `features/knowledgeTree/*`
* node detail Markdown は `features/nodeMarkdown/*`
* ZustandはUI状態のみ（データの真実は organize側）

### Graph GUI 実装ルール

* `useGraphStore` は persisted graph / ACT graph / selection などの正本に近い state を保持し、表示用の派生値は持たない
* `GraphCanvas` は store から直接描画せず、selector を通して visible tree / ACT overlay / auxiliary lanes を投影する
* `GraphNodeCard` は render component とし、details open / branch toggle / act action などの command は parent から渡す
* persisted tree の layout と auxiliary lane の配置規則は分け、ACT / selection node を tree 親子の間に割り込ませない
* `persisted-node` と `act-draft-node` は別 id 空間として扱う
* `anchor_node_id` / `context_node_ids` は relation metadata であり node id の同一視には使わない
* fallback で Organize 操作と ACT draft 操作を横断してはならず、node source に基づいて routing する

### Node Behavior

#### Node Class

* `persisted-node`
  * Firestore `topics/{topicId}/nodes/{nodeId}` を正本とする knowledge node
* `act-draft-node`
  * Firestore `topics/{topicId}/actDrafts/{draftId}` を正本とする ACT draft node
* `selection-node`
  * frontend 内の一時 UI node。Firestore 正本を持たない

#### Source Of Truth

* `persisted-node` の正本は Firestore `nodes/*`
* `act-draft-node` の正本は Firestore `actDrafts/*`
* stream 中で未保存の ACT node は frontend memory にのみ存在する一時 state とする
* localStorage は補助キャッシュであり、正本ではない
* Firestore snapshot と RPC stream が衝突した場合:
  * `persisted-node`: Firestore を優先
  * `act-draft-node`: stream 中は frontend memory を優先し、保存後は Firestore snapshot に収束させる

#### Node ID Rule

* `persisted-node` id と `act-draft-node` id は別空間とする
* `anchor_node_id` / `context_node_ids` は relation を表すだけであり、node id の同一視には使わない
* ACT が persisted node を参照しても overlay はしない
* ACT node は persisted tree とは別 node として表示する

#### Node Lifecycle

* `New ACT` ボタンまたは明示操作で空の ACT node を作成してよい
* Ask / node action / frontend tool からの `run_act` は ACT draft node を開始する
* stream 中は frontend memory の ACT node を更新する
* stream 完了時に `actDrafts/*` へ保存する
* `Clear ACT` は ACT draft node 群を frontend と Firestore の両方から除去する
* expiry 済み draft は Firestore snapshot 上で見えなくなった時点で canvas からも消える
* reconnect / multi-tab 時は Firestore `actDrafts` snapshot を基準に復元する

#### Interaction Responsibility

* single click
  * node を active にする
  * 詳細用の別 pane は開かない
* chevron
  * persisted tree の直下子だけを開閉する
* double click
  * 補助操作であり、node 作成の主経路にしない
* `New ACT`
  * 新規 ACT draft node を作る主経路
* rename/delete
  * node source に応じて routing する
* `Clear ACT`
  * ACT draft node を一括削除する

#### Detail Data Policy

* detail surface の本文表示は store snapshot を使う
* evidence は tree 購読 payload に含めず、detail surface を開いたときだけ購読する
* persisted-node detail は Firestore evidence 購読を持ってよい
* act-draft-node detail は draft data だけを表示し、evidence は持たない

#### Multi-Tab / Reconnect Rule

* persisted tree は Firestore snapshot を常に正本とする
* ACT draft は Firestore snapshot を復元基準とする
* stream 中の未保存 ACT node は local memory に残してよいが、保存後に Firestore 状態へ収束させる
* 他タブで ACT draft が削除/更新された場合、現タブも snapshot に追従する

#### Frontend Tools Alignment

* `submit_ask` は新規 ACT draft node を開始する
* `run_act_with_context` は ACT draft node を開始し、`anchor_node_id` / `context_node_ids` は relation metadata として保持する
* `submit_ask` / `run_act_with_context` は UI 文脈が不足する場合、stream を開始せず clarification を返してよい
* current MVP では browser-attached orchestrator が backend decision DTO を先に取得し、その結果に応じて clarification / candidate selection / `RunAct` を分岐してよい
* `select_nodes` / `open_node_detail` は UI state 操作のみで、knowledge 正本は更新しない
* `open_node_detail` は current MVP では active node 設定と node card 展開を意味する
* `create_selectable_nodes` は `selection-node` を作るだけで、knowledge node は作らない
* current MVP の transport surface は `window.__ACTION_FRONTEND_TOOLS__`, `window.__ACTION_FRONTEND_TOOLS_TRANSPORT__`, `window.postMessage(...)` を持ってよい
* transport availability 確認は direct transport `available()` または bridge `get_status` で行ってよい
* direct transport timeout の current MVP default は `5000ms` とし、browser message bridge timeout は caller 側責務とする

### ベースツリー（これを具体化する）

#### `frontend/`

* `public/`
* `src/app/`: `layout.tsx`, `globals.css`, `page.tsx`
* `src/app/inspector/page.tsx`
* `src/features/layout/`
* `src/features/knowledgeTree/`
* `src/features/graph/`
* `src/features/nodeDetail/`
* `src/features/nodeMarkdown/`
* `src/features/topicActivity/`
* `src/features/reviewInbox/`
* `src/features/action/`
* `src/features/action/actionAct/`
* `src/features/action/actionOrganize/`
* `src/features/inspector/`
* `src/features/auth/components/`: `AuthGate.tsx`, `LoginButton.tsx`, `LogoutButton.tsx`
* `src/features/auth/hooks/`: `useAuthState.ts`, `useRequireAuth.ts`
* `src/features/auth/store/`: `auth-ui-store.ts`
* `src/services/firebase/`: `app.ts`, `auth.ts`, `token.ts`, `csrf.ts`
* `src/services/act/`
* `src/services/organize/`
* `src/components/layout/`, `src/components/ui/`, `src/components/icons/`
* `src/lib/`: `config.ts`, `logger.ts`, `error.ts`, `cookie.ts`
* `src/gen/rpc/`

### 推奨ディレクトリ詳細

```text
frontend/
  src/
    app/
      layout.tsx
      page.tsx
      inspector/
        page.tsx
    features/
      layout/
        components/
          AppShell.tsx
          AppHeader.tsx
          LeftRail.tsx
      knowledgeTree/
        components/
          TreeSidebar.tsx
          TreeSearchBox.tsx
        hooks/
          useTreeSnapshot.ts
          useTreeActions.ts
      graph/
        components/
          GraphCanvas.tsx
          GraphNodeCard.tsx
        utils/
          layoutElk.ts
        selectors/
          toReactFlow.ts
      nodeDetail/
        components/
          NodeDetailPanel.tsx
          NodeSummaryCard.tsx
          NodeEvidenceList.tsx
      nodeMarkdown/
        components/
          MarkdownPane.tsx
          MarkdownEditor.tsx
      topicActivity/
        components/
          TopicActivityPanel.tsx
          TopicTimelineItem.tsx
          RoutingDecisionBadge.tsx
          BundlePreviewCard.tsx
        hooks/
          useTopicActivity.ts
      action/
        shared/
          action-types.ts
          action-groups.ts
        actionAct/
          components/
            ActionActBar.tsx
            ActionActButton.tsx
          hooks/
            useActionAct.ts
            useActStream.ts
        actionOrganize/
          components/
            ActionOrganizeBar.tsx
            ActionOrganizeButton.tsx
          hooks/
            useActionOrganize.ts
      reviewInbox/
        components/
          ReviewInboxPanel.tsx
          ReviewOpCard.tsx
        hooks/
          useReviewInbox.ts
      inspector/
        components/
          InspectorPage.tsx
          PreviewDiffCard.tsx
          EventPreviewList.tsx
    services/
      organize/
        index.ts
        port.ts
        firestore.ts
      act/
        index.ts
        port.ts
        rpc-client.ts
```

### UI/Organize 追加ファイル（MUST）

* `src/features/topicActivity/components/TopicActivityPanel.tsx`
  * input 起点の timeline を描画する
* `src/features/topicActivity/components/TopicTimelineItem.tsx`
  * `resolution -> draft -> bundle -> outline` の1列を描画する
* `src/features/topicActivity/components/RoutingDecisionBadge.tsx`
  * `attach_existing | create_new` と confidence を表示する
* `src/features/topicActivity/hooks/useTopicActivity.ts`
  * Firestore snapshot から activity view model を組み立てる
* `src/features/reviewInbox/components/ReviewInboxPanel.tsx`
  * `organizeOps` 一覧を表示する
* `src/features/reviewInbox/components/ReviewOpCard.tsx`
  * op の要約、state、trace を表示する
* `src/features/reviewInbox/hooks/useReviewInbox.ts`
  * `organizeOps` を購読し panel 用データに正規化する
* `src/features/nodeDetail/components/NodeDetailPanel.tsx`
  * A7 summary + Markdown + `ActionAct` / `ActionOrganize` を束ねる
* `src/features/nodeDetail/components/NodeSummaryCard.tsx`
  * `contextSummary` または `detailHtml` の上部表示を担う
* `src/features/layout/components/AppShell.tsx`
  * header / left rail / canvas を束ねる
* `src/features/action/actionAct/components/ActionActBar.tsx`
  * Act 系 action を表示する
* `src/features/action/actionAct/hooks/useActionAct.ts`
  * `run_act` 系呼び出しをまとめる
* `src/features/action/actionOrganize/components/ActionOrganizeBar.tsx`
  * Organize 系 action を表示する
* `src/features/action/actionOrganize/hooks/useActionOrganize.ts`
  * rename / delete / move / merge など Organize 操作をまとめる
* `src/features/inspector/components/InspectorPage.tsx`
  * local-only preview UI のルート
* `src/features/inspector/components/PreviewDiffCard.tsx`
  * Firestore/GCS/event preview を表示する

### 認証系の追加ファイル（MUST）

* `src/features/auth/components/AuthGate.tsx`
  * 未ログイン時にログイン導線を出し、ログイン済み時に子要素を描画する
* `src/features/auth/hooks/useAuthState.ts`
  * `onAuthStateChanged` を購読し、`user/loading/error` を返す
* `src/features/auth/hooks/useRequireAuth.ts`
  * 認証必須画面で未ログイン時の遷移/表示制御を行う
* `src/services/firebase/app.ts`
  * Firebase app 初期化のみを担当する
* `src/services/firebase/auth.ts`
  * Googleログイン/ログアウト/現在ユーザー取得を提供する
* `src/services/firebase/token.ts`
  * ID Token取得と更新（Authorizationヘッダ用）を提供する
* `src/services/firebase/csrf.ts`
  * `csrf_token` Cookie読み取りと `X-CSRF-Token` 付与ヘルパを提供する
* `src/lib/cookie.ts`
  * Cookie読み取りの共通ユーティリティ（`sid` は読み取らない）

---

## Firebase要件（必須）

* Google/Gmailログイン（Firebase Authの GoogleAuthProvider）
* Firestore snapshot（onSnapshot）
* onAuthStateChangedで未ログイン時はログイン誘導
* Auth/Firestore を前提に初期化する

---

## セッション・送信境界（MUST）

* 認証正本は Firebase ID Token（`Authorization: Bearer ...`）
* `sid` は HttpOnly Cookie 正本として扱い、フロントJSで保存/参照しない
* `csrf_token` Cookie はJS参照可とし、state-changing request で `X-CSRF-Token` に同値を送る
* RPC/HTTP呼び出しは `credentials: include` を必須とする
* `RunActRequest.sid` は原則送らない（互換用途のみ）
* `request_id` はクライアントで毎回UUID生成して付与する

---

## 環境変数（必須ルール）

* 公開してよい frontend 設定は `src/config/local.json` / `src/config/prod.json` に置く
* `src/lib/config.ts` が `NODE_ENV` に応じて local/prod を読み分ける
* frontend に秘密情報は置かない
* 秘密情報が必要な場合は frontend ではなく server 側の環境変数で扱う

---

## UI初期化の必須ポイント

* `app/layout.tsx` に sonner Toaster
* `reactflow/dist/style.css` のimport位置を決める

---

## 実装責務（守ること）

* organize購読：`features/knowledgeTree/hooks/useTreeSnapshot.ts` → `services/organize/index.ts`
* ノード操作：`features/knowledgeTree/hooks/useTreeActions.ts` → `services/organize/index.ts`
* act action: `features/action/actionAct/hooks/*` → `services/act/index.ts`
* organize action: `features/action/actionOrganize/hooks/*` → `services/organize/index.ts`
* 認証ガード：`features/auth/components/AuthGate.tsx` + `features/auth/hooks/useRequireAuth.ts`
* topic activity：`features/topicActivity/hooks/useTopicActivity.ts` → `services/organize/index.ts`
* review inbox：`features/reviewInbox/hooks/useReviewInbox.ts` → `services/organize/index.ts`
* Token注入：`services/firebase/token.ts` を経由して `Authorization` を付与
* CSRF付与：`services/firebase/csrf.ts` を経由して `X-CSRF-Token` を付与
* ReactFlow描画：`features/graph/components/GraphCanvas.tsx`
* ELKレイアウト：`features/graph/utils/layoutElk.ts`
* Markdown表示：`features/nodeMarkdown/components/MarkdownPane.tsx`（sanitize必須）
* node detail 統合：`features/nodeDetail/components/NodeDetailPanel.tsx`
## Patch責務分離（MUST）

`applyPatch` に責務を集中させない。以下の4層へ分離する。

1. Stream Adapter
* 役割: stream購読、`request_id` 再送、終端制御
* 推奨配置: `features/action/actionAct/hooks/useActStream.ts`

2. Patch Reducer
* 役割: `PatchOp` 適用のみ（純粋関数）
* 推奨配置: `features/knowledgeTree/patch/reducer.ts`

3. Graph Projection
* 役割: state -> ReactFlow `nodes/edges` 変換
* 推奨配置: `features/graph/selectors/toReactFlow.ts`

4. UI Store
* 役割: 選択、active node、表示トグルなどUI状態のみ
* 推奨配置: `features/knowledgeTree/store.ts`

禁止:

* reducer内でUI副作用（toast, routing, focus制御）を行わない
* projection内でstateを書き換えない

---

## 設計成果物

1. 上の条件を満たす **具体的なディレクトリツリー（ファイル名まで）**
2. `dependencies` / `devDependencies` 形式の **導入する依存一覧**
3. `features/` `services/` `mocks/` `components/` の主要ディレクトリの **役割を1行ずつ**

---

## 実装フェーズ資料

実装時は以下を参照する。

* `act/specs/behavior/frontend-canvas-phases.md`（Phase 1〜3 の要件と受け入れ条件）
* `act/frontend/ai-implementation-prompts.md`（AI実装指示テンプレート）
* `rpc/connect-rpc.md`（Connect RPCの生成と接続方針）

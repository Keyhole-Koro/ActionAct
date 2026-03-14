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
* 右：選択ノード詳細（Markdown表示＋簡易編集）
* 操作：最低限「削除・リネーム」。余裕があれば「move」「merge」

### MVPレイアウト規約

* `>=1280px`: 左ペイン / キャンバス / 右ペインの3カラム
* `>=768px && <1280px`: 左ペインを縮小し、右ペインは固定表示
* `<768px`: キャンバスを主表示とし、左右ペインはドロワー化する
* 右ペインは node detail と organize activity の両方を受け持つが、同時表示はしない

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
* A7 の `detailHtml` は右ペイン詳細の上部サマリーとして使う
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
* node click で detail を開き、background click で選択解除する

4. Right panel
* `node-detail` と `topic-activity` の2モードを持つ
* モード切り替えは tab か segmented control で行う
* mobile では drawer として同じ内容を再利用する

### 右ペインのモード定義

右ペインは同時に複数責務を持たせず、次のどれか1つだけを表示する。

* `node-detail`
  * A7 `detailHtml`
  * canonical Markdown
  * 関連 node / evidence / actions
* `topic-activity`
  * upload progress
  * input ごとの routing result
  * draft diff
  * bundle preview
  * outline update summary
* `review-inbox`
  * `organizeOps` の一覧
  * state badge
  * trace / createdAt / reason

`review-inbox` は desktop では右ペイン置換、mobile では full-screen sheet にしてよい。

---

## 重要方針

### Markdown詳細は「固定UIコンポーネント群」を増やさない

右ペインは `MarkdownPane` 1つ中心で完結。

* ノード本文は `contentMd` として保持し、`react-markdown + remark-gfm + rehype-sanitize` で描画
* 必要なら `MarkdownEditor` と `MarkdownPreview` を追加して編集/プレビューを分割してよい
* 「根拠」「関連」などは Markdown見出し・箇条書きとして表現（専用UIは作らない）
* `node://` の内部リンクは MarkdownPane 内でリンクレンダリングのみカスタムし、選択ノード変更を実現
* A7 の `detailHtml` は MarkdownPane の代替ではなく、Markdown本文の前に置くサマリー領域として扱う
* `detailHtml` が存在しない場合でも MarkdownPane 単体で成立するようにする

---

# ✅ 追加要件：Factory & Mock（必須）

Firestore/RPCが未接続でもデモできるように、**Factoryでモックデータを生成**し、`services` の実装を **Real/Mockで切替**できるようにする。

### Mock切替ルール

* `src/config/local.json` の `useMocks=true` のとき **完全モックモード**

  * organize：Firestore snapshot の代わりに「擬似snapshot（subscribe/unsubscribe）」でツリー更新を流す
  * act：Connect RPC の代わりに「擬似レスポンス（候補ノード/引用/結論）」を返す
* `src/config/prod.json` の `useMocks=false` のとき **本番モード**（Firebase + Connect RPC）

### Factoryの責務

* 生成するもの：

  * Tree/Node（抽象↔具体の階層、親子、表示用タイトル）
  * Node本文Markdown（「要点」「根拠」「関連」セクションを含むサンプル）
  * ReactFlow用の nodes/edges（表示レイアウト可能な形）
  * act結果（候補ノード、引用リンクっぽいもの、理由、次アクション）
* 生成ポリシー：

  * **安定ID**（seedで再現可能）を返せること（例：`seed`引数）
  * 深さ/幅/ノード数を指定できること（例：`depth`, `branching`, `count`）
  * デモ映えする内容（抽象→具体の関係が分かる、Markdownにリンク/箇条書きがある）
  * URLは捏造OKではなく「デモ用サンプル」として `props.source="mock"` を付けるなど区別する

### services の設計ルール（DI / Swap）

* `services/act` と `services/organize` は **インターフェース（port）** を定義し、実装（real/mock）を差し替える
* 例：

  * `services/act/port.ts`（`ActPort` interface）
  * `services/act/real.ts`（Connect RPC）
  * `services/act/mock.ts`（Factoryで生成）
  * `services/act/index.ts`（ENVでreal/mockを返す）
* organize も同様に `OrganizePort` を用意し、`subscribeTree()` が real は `onSnapshot`、mock は擬似購読を返す

---

## ディレクトリ構成（Next.js App Router想定）

以下の方針で **具体的なディレクトリツリー（ファイル名まで）** を生成せよ。

* `services/act/*`：Connect RPC（real）と mock を共存
* `services/organize/*`：Firestore（real）と mock を共存（snapshot差替）
* Firebase初期化/Authは `services/firebase/*`
* ReactFlowとELKは `features/graph/*`
* 左ペイン統合は `features/knowledgeTree/*`
* 右ペインMarkdownは `features/nodeMarkdown/*`
* Factory/Mockは `mocks/` or `testing/` に集約（本体featuresに散らさない）
* ZustandはUI状態のみ（データの真実は organize側）

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
* `src/mocks/factories/`, `src/mocks/datasets/`, `src/mocks/organize/`, `src/mocks/act/`
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
          RightPanelRouter.tsx
        store/
          panel-store.ts
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
        real.ts
        mock.ts
      act/
        index.ts
        port.ts
        real.ts
        mock.ts
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
  * header / left rail / canvas / right panel を束ねる
* `src/features/layout/components/RightPanelRouter.tsx`
  * `node-detail | topic-activity | review-inbox` の切り替えを担う
* `src/features/layout/store/panel-store.ts`
  * 右ペインの mode, open/close, selected ids を管理する
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
* モックモード時はAuth/Firestoreを必須にしない（UIを回す）

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

* organize購読：`features/knowledgeTree/hooks/useTreeSnapshot.ts` → `services/organize/index.ts`（real/mock吸収）
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
* 右ペイン切替：`features/layout/components/RightPanelRouter.tsx`
* Factory/Mockは `src/mocks/*` 配下に閉じ込め、本体featuresに混ぜない

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
* 役割: 選択、右ペイン、表示トグルなどUI状態のみ
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

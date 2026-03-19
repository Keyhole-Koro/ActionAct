# ActionAct Frontend

Next.js frontend です。

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Environment

公開してよい frontend 設定は JSON 正本で管理します。

* local: [local.json](/home/unix/Action/ActionAct/frontend/src/config/local.json)
* prod: [prod.json](/home/unix/Action/ActionAct/frontend/src/config/prod.json)

`src/lib/config.ts` が `NODE_ENV` に応じて読み分けます。
秘密情報は frontend に置かず、必要なら server 側で環境変数を読む前提です。

Required:

* local/prod JSON の整合
* Firebase 公開設定
  * `firebaseApiKey`
  * `firebaseAuthDomain`
  * `firebaseAppId`
* Act API 接続先
  * `rpcBaseUrl`
  * `actApiBaseUrl`

Example:

```bash
cd ActionAct/frontend
npm run dev
```

## Notes

* Firebase Auth と `POST /auth/session/bootstrap` が前提です
* `AuthGate` が Google sign-in 後に session bootstrap を行い、`sid` / `csrf_token` cookie を揃えます
* `services/firebase/token.ts` が `Authorization` を付与し、`services/firebase/csrf.ts` が `X-CSRF-Token` を付与します

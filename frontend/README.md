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

起動時に `src/lib/env.ts` が `NEXT_PUBLIC_*` を検証します。missing や空文字では起動しません。

Required:

* `NEXT_PUBLIC_USE_MOCKS`
  * `true` or `false`
* `NEXT_PUBLIC_RPC_BASE_URL`
* `NEXT_PUBLIC_ACT_API_BASE_URL`
* `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`
* `NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST`
* `NEXT_PUBLIC_GCLOUD_PROJECT`

Example:

```bash
NEXT_PUBLIC_USE_MOCKS=true \
NEXT_PUBLIC_RPC_BASE_URL=http://localhost:8080 \
NEXT_PUBLIC_ACT_API_BASE_URL=http://localhost:8080 \
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST=localhost:8081 \
NEXT_PUBLIC_GCLOUD_PROJECT=local-dev \
npm run dev
```

## Notes

* `NEXT_PUBLIC_USE_MOCKS=true` では mock service を使います
* `NEXT_PUBLIC_USE_MOCKS=false` では Connect RPC / Act API 接続前提です

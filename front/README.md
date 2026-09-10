# フロントエンド

React・TypeScript・Viteで実装しています。起動方法、PHPの設定、API、保存仕様、テスト手順は [ルートのREADME](../README.md) を参照してください。

```sh
npm ci
npm run dev
npm run build
npm run lint
```

開発時の `/api` は `vite.config.ts` でPHPサーバー（127.0.0.1:8000）へ転送します。

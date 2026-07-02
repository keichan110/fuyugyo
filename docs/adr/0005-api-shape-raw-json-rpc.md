# API は生データ + HTTP ステータスとし、レスポンスエンベロープと /usecases 名前空間を廃止する

## Status

accepted

## Context

現行 API には3つの不統一がある: (1) ミューテーションが Server Actions と REST fetch の二経路、(2) レスポンスが CRUD は手書きエンベロープ `{success, data, error, message}`・usecase 系は別ラッパー、(3) CRUD と usecase が URL 名前空間で分かれている。Hono RPC + TanStack Query への移行を機に統一する。

## Decision

- **ミューテーション経路は単一**化される。Server Actions は廃止され、全ミューテーションが「Hono ルート → Hono RPC → TanStack Query `useMutation`」を通る。
- **レスポンスは生データ + HTTP ステータス**を採用する。成功は `c.json(data)` でデータそのものを返す。エンベロープ `{success, data, error}` は廃止。
  - エラーは Hono の `throw new HTTPException(status, { message })` + 中央 `onError` ハンドラで統一形に変換。成功ルートの型を汚さない。
  - クライアントは「`!res.ok` なら throw」を共通フックに1回書き、TanStack Query のエラー機構に委ねる。
- **`/api/usecases` 名前空間は廃止**。各 feature の `api.ts` に CRUD と集約エンドポイントを同居させる（例: `GET /api/shifts`, `GET /api/shifts/weekly`）。

## Consequences

- Hono RPC の型推論が綺麗に効く（`await res.json()` が即データ型、unwrap 不要）。
- 「画面要件に合わせた集約エンドポイントを作ってよい（N+1 回避）」という usecase-driven の**思想は維持**する。URL 構造ではなく設計方針として残す。
- HTTP ステータスと `success` フラグの二重表現がなくなり、TanStack Query の成功/失敗判定が正しく働く。

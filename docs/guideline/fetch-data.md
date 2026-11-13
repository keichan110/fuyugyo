# データ取得と更新

ブラウザの `queries.ts` から `src/lib/rpc.ts` の `client` を通じて API を呼び出す。DB へのアクセスは Hono API 内に閉じる。

## 読み取り

`useQuery` の `queryKey` には絞り込み条件を含める。HTTP エラーを確認してから、レスポンスを共有 Zod スキーマで検証する。

```ts
const res = await client.api.certifications.$get({ query });
if (!res.ok) {
  throw new Error('資格一覧の取得に失敗しました');
}
return certificationListSchema.parse(await res.json());
```

実例: `src/features/certifications/queries.ts` の `useCertifications`。`staleTime` はデータの性質に合わせ、共通の値は `src/lib/query-client.ts` を利用する。

## 更新

`useMutation` の `mutationFn` から `$post` / `$patch` / `$delete` を呼び出す。失敗を例外として扱い、成功時に関連するキャッシュを無効化する。

```ts
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: CERTIFICATIONS_QUERY_KEY });
},
```

実例: 同ファイルの `useCreateCertification`。一覧だけでなく詳細など影響するキーも確認する。UI では送信中の状態と失敗時の通知を表示する。

認証 Cookie は同一オリジンの API に送られる。機密情報や DB クライアントをブラウザ側へ持ち込まない。

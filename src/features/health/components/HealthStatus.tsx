import { Button } from '@/components/ui/button';
import { useHealth } from '../queries';

/**
 * ヘルスチェック結果を表示するコンポーネント。
 * Hono RPC（型安全）で取得したデータをそのまま描画し、歩く骨格の疎通を可視化する。
 */
export function HealthStatus() {
  const { data, isLoading, isError, refetch, isRefetching } = useHealth();

  return (
    <section className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-card-foreground">
      <h1 className="font-bold text-2xl">Fuyugyō</h1>
      <p className="text-muted-foreground text-sm">
        Hono + Drizzle/D1 + Vite + React 19 walking skeleton
      </p>

      {isLoading && !data && (
        <p className="text-muted-foreground">確認中…</p>
      )}
      {isError && <p className="text-red-600">API への接続に失敗しました</p>}
      {data && !isError && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">status</dt>
          <dd className="font-mono">{data.status}</dd>
          <dt className="text-muted-foreground">departmentCount</dt>
          <dd className="font-mono">{data.departmentCount}</dd>
          <dt className="text-muted-foreground">timestamp</dt>
          <dd className="font-mono">{data.timestamp}</dd>
        </dl>
      )}

      <Button disabled={isRefetching} onClick={() => refetch()}>
        再取得
      </Button>
    </section>
  );
}

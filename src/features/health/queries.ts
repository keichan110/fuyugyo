import { useQuery } from '@tanstack/react-query';

import { client } from '@/lib/rpc';

import { healthResponseSchema, type HealthResponse } from './schema';

/**
 * ヘルスチェックエンドポイントを Hono RPC 経由で取得する。
 * `!res.ok` の場合は throw し、TanStack Query のエラー機構に委ねる（ADR 0005）。
 */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<HealthResponse> => {
      const res = await client.api.health.$get();
      if (!res.ok) {
        throw new Error('ヘルスチェックに失敗しました');
      }
      // RPC の型推論に加え、ランタイムでもレスポンス形式を保証する
      return healthResponseSchema.parse(await res.json());
    },
  });
}

"use client";

import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

// 設計書に基づいたキャッシュ戦略設定
const LIST_QUERY_KEYS = [
  ["public-shifts"],
  ["public-shifts", "departments"],
] as const satisfies readonly QueryKey[];

const LIST_QUERY_CACHE_OPTIONS = {
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間設定のため
  staleTime: 60 * 1000,
  // biome-ignore lint/style/noMagicNumbers: キャッシュ時間設定のため
  gcTime: 30 * 60 * 1000,
} as const;

function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        // 5分のstaleTime（データが新鮮と見なされる時間）
        // biome-ignore lint/style/noMagicNumbers: キャッシュ時間設定のため
        staleTime: 5 * 60 * 1000,
        // 30分のgcTime（キャッシュ保持時間）
        // biome-ignore lint/style/noMagicNumbers: キャッシュ時間設定のため
        gcTime: 30 * 60 * 1000,
        // リトライ戦略（エラー時の再試行）
        retry: (failureCount, error) => {
          // ネットワークエラーの場合は最大2回リトライ
          const MAX_NETWORK_RETRIES = 2;
          if (error instanceof TypeError && error.message.includes("fetch")) {
            return failureCount < MAX_NETWORK_RETRIES;
          }
          // その他のエラーは1回のみリトライ
          return failureCount < 1;
        },
        // フォーカス復帰時の不要な再取得はプリフェッチと手動リフレッシュで吸収する
        refetchOnWindowFocus: false,
        // 再接続時の再取得を有効化
        refetchOnReconnect: true,
      },
      mutations: {
        // mutation失敗時のリトライ（1回のみ）
        retry: 1,
      },
    },
  });

  // リスト系クエリは一時的な遷移戻りでもキャッシュを生かすために staleness を延長
  for (const queryKey of LIST_QUERY_KEYS) {
    client.setQueryDefaults(queryKey, LIST_QUERY_CACHE_OPTIONS);
  }

  return client;
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: 常に新しいクライアントを作成
    return makeQueryClient();
  }
  // Browser: シングルトンパターンでクライアントを再利用
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

type QueryProviderProps = {
  children: React.ReactNode;
};

export function QueryProvider({ children }: QueryProviderProps) {
  // useState を使用してクライアントを初期化
  // これによりSSRとCSRでのhydrationエラーを防ぐ
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* 開発環境でのみReact Query Devtoolsを表示 */}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

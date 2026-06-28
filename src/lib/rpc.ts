import { hc } from 'hono/client';
// 値の import ではなく型のみ。サーバーコード（api.ts）はクライアントバンドルに混入しない。
import type { AppType } from '@/index';

/** Hono RPC クライアント。RPC の型は `AppType` から推論される。 */
export const client = hc<AppType>('/');

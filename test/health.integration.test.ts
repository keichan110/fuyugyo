import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../src/features/health/schema';
import app from '../src/index';

describe('GET /api/health', () => {
  it('実 D1 に接続し status=ok と departmentCount を返す', async () => {
    const res = await app.request('/api/health', {}, env);

    expect(res.status).toBe(200);
    // 型アサーションを使わず、Zod でレスポンス形式を検証する
    const body = healthResponseSchema.parse(await res.json());
    expect(body.status).toBe('ok');
    // マイグレーション適用直後の空 D1 なので 0 件
    expect(body.departmentCount).toBe(0);
    // timestamp が ISO 8601 形式であること（string 型自体は parse で保証済み）
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

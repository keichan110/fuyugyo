import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from '../src/features/health/schema';
import app from '../src/index';

describe('GET /api/health', () => {
  it('DB に依存せず status=ok を返す', async () => {
    const inaccessibleDb = new Proxy(env.DB, {
      get() {
        throw new Error('health endpoint から DB へアクセスしました');
      },
    });
    const res = await app.request('/api/health', {}, { ...env, DB: inaccessibleDb });

    expect(res.status).toBe(200);
    // 型アサーションを使わず、Zod でレスポンス形式を検証する
    const body = healthResponseSchema.parse(await res.json());
    expect(body.status).toBe('ok');
    // timestamp が ISO 8601 形式であること（string 型自体は parse で保証済み）
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

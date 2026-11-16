import { authStatePath } from '../fixtures/auth-state.ts';
import { ROLE_TARGET_ID } from '../fixtures/business-data.ts';
import { expect, test } from '../fixtures/test.ts';

test.use({ storageState: authStatePath('member') });
test('権限不足の本文付きPOSTを連続して送っても403を維持する', async ({ context }) => {
  // 旧配信経路では66回目に503を再現した。間欠的なため余裕を持って500回とする。
  // ローカル実測は1ブラウザ約2秒。開発用プロキシに戻った場合を検知するガードとして維持する。
  for (let index = 0; index < 500; index++) {
    const response = await context.request.post(`/api/users/${ROLE_TARGET_ID}/deactivate`, {
      data: {},
    });
    expect(await response.text(), `応答 ${index}`).toContain('Insufficient permissions');
    expect(response.status(), `応答 ${index}`).toBe(403);
  }
});

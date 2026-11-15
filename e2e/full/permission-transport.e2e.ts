import { authStatePath } from '../fixtures/auth-state.ts';
import { ROLE_TARGET_ID } from '../fixtures/business-data.ts';
import { expect, test } from '../fixtures/test.ts';

test.use({ storageState: authStatePath('member') });
test('権限不足の本文付きPOSTを連続して送っても403を維持する', async ({ context }) => {
  // 開発用プロキシでは、本文を読む前の拒否応答が断続的に503へ変わるため連続送信で検証する。
  for (let index = 0; index < 500; index++) {
    const response = await context.request.post(`/api/users/${ROLE_TARGET_ID}/deactivate`, {
      data: {},
    });
    expect(await response.text(), `応答 ${index}`).toContain('Insufficient permissions');
    expect(response.status(), `応答 ${index}`).toBe(403);
  }
});

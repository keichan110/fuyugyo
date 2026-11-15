import { expect, test } from '../fixtures/test.ts';

test(
  '未認証で保護画面にアクセスするとログイン画面へ遷移する',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  },
);

test('未認証で保護 API にアクセスすると 401 を返す', { tag: '@smoke' }, async ({ request }) => {
  const response = await request.get('/api/auth/me');
  expect(response.status()).toBe(401);
});

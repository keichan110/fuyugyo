import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

test.describe('シフト表示', () => {
  test.use({ storageState: authStatePath('admin') });

  test('seed したシフトと担当者を閲覧できる', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/shifts');
    await expect(page.getByRole('heading', { level: 2, name: 'シフト表' })).toBeVisible();
    await expect(page.getByText('1/16（金）')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '一般レッスン 2名 高橋 一郎 ・ 鈴木 次郎' }),
    ).toBeVisible();
  });
});

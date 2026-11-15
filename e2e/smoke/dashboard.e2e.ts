import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

test.describe('ADMIN のダッシュボード', () => {
  test.use({ storageState: authStatePath('admin') });

  test('固定日付の見出し付きでトップが表示される', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '1月15日（木）' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'このあと' })).toBeVisible();
  });
});

test.describe('MEMBER のダッシュボード', () => {
  test.use({ storageState: authStatePath('member') });

  test(
    '自分が割り当てられたシフトが直近の勤務予定に表示される',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto('/');
      // 「このあと」の次の勤務（1/16 の一般レッスン）に、自分と同僚の名前が並ぶ
      await expect(page.getByRole('heading', { level: 2, name: 'このあと' })).toBeVisible();
      await expect(page.getByText('あと1日', { exact: true })).toBeVisible();
      await expect(
        page.getByText('高橋 一郎 ・ 鈴木 次郎').filter({ visible: true }),
      ).toBeVisible();
    },
  );
});

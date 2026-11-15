import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

for (const role of ['member', 'manager', 'admin'] as const) {
  test.describe(`${role} のモバイルナビゲーション`, () => {
    test.use({ storageState: authStatePath(role) });

    test('権限に応じた固定タブとその他メニューを表示する', { tag: '@smoke' }, async ({ page }) => {
      await page.goto('/');
      const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
      await expect(navigation.getByRole('link')).toHaveText(
        role === 'member'
          ? ['ホーム', 'シフト表', 'シフト希望']
          : ['ホーム', 'シフト表', 'シフト希望', 'シフト管理'],
      );
      await expect(page.getByRole('button', { name: 'ナビゲーションを開く' })).toBeHidden();
      await navigation.getByRole('button', { name: 'その他' }).click();
      const drawer = page.getByRole('dialog', { name: 'その他' });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('link', { name: 'ホーム', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('link', { name: 'シフト表', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('link', { name: 'シフト管理', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('button', { name: 'ログアウト' })).toBeVisible();
      await expect(drawer.getByRole('link', { name: 'ユーザー', exact: true })).toHaveCount(
        role === 'admin' ? 1 : 0,
      );
      await expect(drawer.getByRole('link', { name: '招待', exact: true })).toHaveCount(
        role === 'admin' ? 1 : 0,
      );
      if (role !== 'member') {
        await drawer.getByRole('link', { name: '資格', exact: true }).click();
        await expect(drawer).toBeHidden();
        await expect(navigation.getByRole('button', { name: 'その他' })).toHaveAttribute(
          'data-active',
          'true',
        );
      }
    });

    test('未連携でもタブ数を保ち、シフト表を閲覧できる', async ({ page }) => {
      // 認証APIの境界で未連携状態を再現し、共有D1のユーザー情報は変更しない。
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const user = await response.json();
        await route.fulfill({ response, json: { ...user, instructorId: null } });
      });
      await page.goto('/');
      const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
      await expect(navigation.getByRole('link')).toHaveCount(role === 'member' ? 2 : 3);
      await expect(navigation.getByRole('button', { name: /シフト希望/ })).toBeDisabled();
      await expect(navigation.getByText('要連携')).toBeVisible();
      await expect(page.getByRole('button', { name: '連携する', exact: true })).toBeVisible();
      await navigation.getByRole('link', { name: 'シフト表', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'シフト表', exact: true })).toBeVisible();
      await expect(page.getByRole('switch', { name: '自分だけ' })).toBeDisabled();
      await expect(page.getByText('1/16（金）')).toBeVisible();

      let availabilityRequested = false;
      page.on('request', (request) => {
        if (request.url().includes('/api/availabilities/me')) availabilityRequested = true;
      });
      await page.goto('/availabilities');
      await expect(page.getByRole('heading', { name: 'シフト希望', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '連携する', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '一括設定' })).toHaveCount(0);
      expect(availabilityRequested).toBe(false);
    });
  });
}

test.describe('デスクトップのナビゲーション', () => {
  test.use({ storageState: authStatePath('admin'), viewport: { width: 1280, height: 800 } });

  test('既存のヘッダーとサイドバーを維持する', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'サイドバーを閉じる' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'シフト管理', exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });
});

import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

test.describe('シフト管理（手動割当）', () => {
  test.use({ storageState: authStatePath('admin') });

  test(
    '空きのあるシフトにインストラクターを割り当てて保存でき、リロード後も残る',
    {
      tag: '@smoke',
    },
    async ({ page }) => {
      await page.goto('/shifts/manage');
      await page.getByRole('button', { name: 'スキーのシフト管理を開く' }).click();
      await expect(page.getByRole('heading', { name: 'スキーのシフト管理' })).toBeVisible();

      // 1/18（日）は seed の下書きシフト（必要人数2・未配置）
      const dateButton = page.getByRole('button', { name: /1\/18（日）の割り当てを編集/ });
      await dateButton.click();
      await page.getByRole('checkbox', { name: '伊藤 二郎' }).click();
      await page.getByRole('button', { name: '下書きを保存' }).click();
      await expect(page.getByText('未保存の変更')).toBeHidden();

      // リロード後も割り当てが保存されている（フォームの URL は部門を保持する）
      await page.reload();
      await page.getByRole('button', { name: /1\/18（日）の割り当てを編集/ }).click();
      await expect(page.getByRole('checkbox', { name: '伊藤 二郎' })).toBeChecked();
    },
  );
});

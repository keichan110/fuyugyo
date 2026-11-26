import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

declare global {
  interface Window {
    dashboardCspViolations?: string[];
  }
}

test.describe('ADMIN のダッシュボード', () => {
  test.use({ storageState: authStatePath('admin') });

  test('固定日付の見出し付きでトップが表示される', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '1月15日（木）' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'このあと' })).toBeVisible();
  });

  test('ビルド済みダッシュボードで CSP 違反が発生しない', async ({ page }) => {
    test.skip(process.env.E2E_BUILT !== '1', 'ビルド済み SPA の CSP を検証する');

    await page.addInitScript(() => {
      const violations: string[] = [];
      window.dashboardCspViolations = violations;
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
      });
    });

    const response = await page.goto('/');
    const headers = response?.headers();
    const policy =
      headers?.['content-security-policy'] ?? headers?.['content-security-policy-report-only'];
    expect(policy).toContain("script-src 'self'");
    await expect(page.getByRole('heading', { level: 2, name: 'このあと' })).toBeVisible();
    const violations = await page.evaluate(async () => {
      // 描画後のフレームまで待ち、初期表示中にキューに入った違反をブラウザ内で回収する。
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return window.dashboardCspViolations;
    });
    expect(violations).toEqual([]);
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

  test('旧シフト希望リマインダーを表示しない', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'このあと' })).toBeVisible();
    // 表示前に「0件」と判定しないよう、勤務可否などの初期表示の取得が落ち着くまで待つ
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('月分のシフト希望を確認してください')).toHaveCount(0);
  });
});

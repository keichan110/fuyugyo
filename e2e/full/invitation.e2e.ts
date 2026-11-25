import { invitationSchema } from '../../src/features/invitations/schema.ts';
import { E2E_BASE_URL } from '../env.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

test.describe('ADMIN の招待リンク', () => {
  test.use({ storageState: authStatePath('admin') });

  test('ユーザー管理から招待を発行して共有導線を使え、未認証の利用者にログイン案内を表示できる', async ({
    page,
    playwright,
  }) => {
    await page.goto('/users');
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/invitations') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '招待リンク', exact: true }).click();
    const response = await created;
    expect([200, 201]).toContain(response.status());
    const invitation = invitationSchema.parse(await response.json());

    const dialog = page.getByRole('dialog', { name: '招待リンク' });
    const urlInput = dialog.getByRole('textbox', { name: '招待リンク' });
    await expect(urlInput).toHaveValue(new RegExp(invitation.token));
    const url = await urlInput.inputValue();
    await expect(dialog.getByText('日本時間').first()).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'リンクをコピー' })).toBeVisible();
    // LINE の送信先選択画面へ渡す共有 URL（文面と招待 URL を含む）
    const lineShare = dialog.getByRole('link', { name: 'LINE で送る' });
    const href = (await lineShare.getAttribute('href')) ?? '';
    expect(href.startsWith('https://line.me/R/share?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toContain(url);

    // 発行済み一覧は折りたたまれており、開くと作成者名が見える
    await dialog.getByRole('button', { name: '発行済みの招待リンク' }).click();
    await expect(dialog.getByRole('button', { name: /を停止$/ }).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const anonymous = await playwright.request.newContext({ baseURL: E2E_BASE_URL });
    try {
      expect((await anonymous.get(`/api/invitations/${invitation.token}/verify`)).status()).toBe(
        200,
      );
      // 招待URLはOAuth開始APIを指す。LINEへ追従せず、自社の入口とCookie発行まで確認する。
      const login = await anonymous.get(url, { maxRedirects: 0 });
      expect(login.status()).toBe(302);
      const authorizeUrl = new URL(login.headers().location ?? '');
      expect(authorizeUrl.origin).toBe('https://access.line.me');
      expect(authorizeUrl.searchParams.get('bot_prompt')).toBe('normal');
      expect(login.headers()['set-cookie']).toContain('auth-session=');
    } finally {
      await anonymous.dispose();
    }
    await page.context().clearCookies();
    await page.goto(`/login?invite=${invitation.token}`);
    await expect(page.getByRole('heading', { name: 'Members only' })).toBeVisible();
    await expect(page.getByRole('button', { name: /LINE/ })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`invite=${invitation.token}`));
  });

  test('表示中のリンクと別のリンクを続けて停止しても、先に停止したリンクは共有できない', async ({
    page,
  }) => {
    // 別の ADMIN が発行したリンク B を、一覧 API の境界で再現する（共有 D1 のリンクは増やさない）
    const now = Date.now();
    const linkB = {
      token: 'e2e-other-admin-link',
      expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
      isActive: true,
      createdBy: null,
      createdByName: 'E2E別の管理者',
      maxUses: null,
      usedCount: 1,
      description: null,
      createdAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
    };
    let linkBStopped = false;
    let releaseDeactivateA = () => {};
    const deactivateAGate = new Promise<void>((resolve) => {
      releaseDeactivateA = resolve;
    });
    await page.route('**/api/invitations', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      const items: unknown = await response.json();
      return route.fulfill({
        response,
        json: [...(Array.isArray(items) ? items : []), ...(linkBStopped ? [] : [linkB])],
      });
    });
    await page.route('**/api/invitations/*/deactivate', async (route) => {
      if (route.request().url().includes(linkB.token)) {
        linkBStopped = true;
        return route.fulfill({ json: { ...linkB, isActive: false } });
      }
      // リンク A の停止は、B の停止が終わるまで完了させない（連続・並行操作の再現）
      await deactivateAGate;
      return route.fallback();
    });

    await page.goto('/users');
    await page.getByRole('button', { name: '招待リンク', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '招待リンク' });
    await expect(dialog.getByRole('link', { name: 'LINE で送る' })).toBeVisible();
    await dialog.getByRole('button', { name: /^発行済みの招待リンク/ }).click();

    // 表示中のリンク A（E2E管理者が発行）→ 別のリンク B の順に停止する
    await dialog
      .getByRole('button', { name: /^E2E管理者が発行した招待リンク.*を停止$/ })
      .first()
      .click();
    await dialog
      .getByRole('button', { name: /^E2E別の管理者が発行した招待リンク.*を停止$/ })
      .click();
    await expect.poll(() => linkBStopped).toBe(true);
    releaseDeactivateA();

    await expect(dialog.getByText('このリンクは停止しました。')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'リンクをコピー' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'LINE で送る' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '新しいリンクを発行' })).toBeVisible();
  });

  test('発行済み一覧の取得に失敗したら理由と再試行を表示し、再試行で一覧を表示する', async ({
    page,
  }) => {
    let failing = true;
    await page.route('**/api/invitations', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      if (failing) {
        return route.fulfill({ status: 500, json: { message: '一覧を取得できません' } });
      }
      return route.fallback();
    });

    await page.goto('/users');
    await page.getByRole('button', { name: '招待リンク', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '招待リンク' });
    await dialog.getByRole('button', { name: /^発行済みの招待リンク/ }).click();
    // 取得失敗は自動再試行のあとで表示されるため、待ち時間を長めにとる
    await expect(dialog.getByText('一覧を取得できません')).toBeVisible({ timeout: 20_000 });
    failing = false;
    await dialog.getByRole('button', { name: '再試行' }).click();
    await expect(dialog.getByText('一覧を取得できません')).toBeHidden();
    await expect(dialog.getByRole('button', { name: /を停止$/ }).first()).toBeVisible();
  });
});

test.describe('MANAGER は招待できない', () => {
  test.use({ storageState: authStatePath('manager') });

  test('招待リンクのボタンが無く、管理 API も 403 になる', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: '招待リンク', exact: true })).toHaveCount(0);
    const json = { 'Content-Type': 'application/json' };
    expect(
      (await page.request.post('/api/invitations', { headers: json, data: {} })).status(),
    ).toBe(403);
    expect((await page.request.get('/api/invitations')).status()).toBe(403);
    expect(
      (
        await page.request.post('/api/invitations/x/deactivate', { headers: json, data: {} })
      ).status(),
    ).toBe(403);
  });
});

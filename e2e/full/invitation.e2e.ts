import { invitationSchema } from '../../src/features/invitations/schema.ts';
import { E2E_BASE_URL } from '../env.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

test.use({ storageState: authStatePath('manager') });

test('MANAGERが招待を発行し、未認証の利用者にログイン案内を表示できる', async ({
  page,
  playwright,
}) => {
  await page.goto('/invitations');
  await expect(page.getByRole('heading', { name: '招待管理' })).toBeVisible();
  await page.getByRole('button', { name: '招待リンクを発行', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '招待リンクを発行' });
  await dialog.getByRole('textbox', { name: 'メモ（任意）' }).fill('E2E招待');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/invitations') && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: '発行する', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const invitation = invitationSchema.parse(await response.json());
  await expect(dialog).toBeHidden();
  const urlInput = page.locator('input[readonly]');
  await expect(urlInput).toHaveValue(new RegExp(invitation.token));
  const url = await urlInput.inputValue();
  await page.reload();
  await expect(urlInput).toHaveValue(url);

  const anonymous = await playwright.request.newContext({ baseURL: E2E_BASE_URL });
  try {
    expect((await anonymous.get(`/api/invitations/${invitation.token}/verify`)).status()).toBe(200);
    // 招待URLはOAuth開始APIを指す。LINEへ追従せず、自社の入口とCookie発行まで確認する。
    const login = await anonymous.get(url, { maxRedirects: 0 });
    expect(login.status()).toBe(302);
    expect(new URL(login.headers().location ?? '').origin).toBe('https://access.line.me');
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

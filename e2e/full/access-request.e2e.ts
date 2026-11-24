import { signAccessRequestToken } from '../../src/server/auth/access-request-token.ts';
import {
  ACCESS_REQUEST_COOKIE,
  ACCESS_REQUEST_COOKIE_PATH,
} from '../../src/server/auth/cookies.ts';
import { E2E_BASE_URL, E2E_JWT_SECRET } from '../env.ts';
import { expect, test } from '../fixtures/test.ts';

test('未登録の人が利用申請を送り、承認待ち画面に進める', async ({ page }) => {
  // LINE の OAuth 往復は再現できないため、callback が発行する申請 Cookie を直接作る。
  // E2E 環境では request.cf がなく位置が取れないが、その場合も申請できることを確認する。
  const token = await signAccessRequestToken(
    { userId: `e2e-requester-${crypto.randomUUID()}`, displayName: 'E2E申請者' },
    E2E_JWT_SECRET,
  );
  await page.context().addCookies([
    {
      name: ACCESS_REQUEST_COOKIE,
      value: token,
      domain: new URL(E2E_BASE_URL).hostname,
      path: ACCESS_REQUEST_COOKIE_PATH,
    },
  ]);

  await page.goto('/access-request');
  await expect(page.getByRole('heading', { name: 'Request access' })).toBeVisible();
  await expect(
    page.getByText('このLINEアカウントには利用許可がありません。', { exact: false }),
  ).toBeVisible();

  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/access-requests') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '利用許可を申請する', exact: true }).click();
  expect((await submitted).status()).toBe(201);

  await expect(page).toHaveURL(/\/access-request\/pending$/);
  await expect(page.getByText('利用許可の申請を受け付けました。', { exact: false })).toBeVisible();
});

test('申請 Cookie がない状態で申請すると、期限切れの案内とログインへの導線を表示する', async ({
  page,
}) => {
  await page.goto('/access-request');
  await page.getByRole('button', { name: '利用許可を申請する', exact: true }).click();

  await expect(
    page.getByText('申請の有効期限が切れました。もう一度ログインしてください。'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '利用許可を申請する', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'ログイン画面へ' }).click();
  await expect(page).toHaveURL(/\/login/);
});

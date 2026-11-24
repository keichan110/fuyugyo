import { createClient } from '@libsql/client';
import type { Page } from '@playwright/test';
import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';

import { getLocalD1Path } from '../../scripts/lib/get-local-d1-path.ts';
import { accessRequests, instructors, users } from '../../src/server/db/schema.ts';
import { E2E_BASE_URL, E2E_PERSIST_DIR } from '../env.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

/** 実行ごとに一意な接尾辞。他のテストのデータと衝突しないよう名前・LINE ID に付ける */
const RUN = crypto.randomUUID().slice(0, 8);
const LINE_PREFIX = `e2e-access-${RUN}`;
const INSTRUCTOR_LAST_NAME = `E2E承認${RUN}`;

/** ローカル D1 に対して処理を実行する。画面や API を介さず申請データを用意・確認するために使う */
async function withDb<T>(run: (db: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
  const client = createClient({ url: `file:${getLocalD1Path(E2E_PERSIST_DIR)}` });
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    return await run(drizzle(client));
  } finally {
    client.close();
  }
}

/** 承認待ちの申請を 1 件作成し、表示名を返す */
async function seedRequest(
  key: string,
  location: { country?: string; region?: string; city?: string } = {},
): Promise<string> {
  const displayName = `E2E申請${key}${RUN}`;
  await withDb((db) =>
    db.insert(accessRequests).values({
      id: crypto.randomUUID(),
      lineUserId: `${LINE_PREFIX}-${key}`,
      displayName,
      country: location.country ?? null,
      region: location.region ?? null,
      city: location.city ?? null,
      requestedAt: new Date(),
    }),
  );
  return displayName;
}

async function requestExists(key: string): Promise<boolean> {
  const rows = await withDb((db) =>
    db
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(eq(accessRequests.lineUserId, `${LINE_PREFIX}-${key}`)),
  );
  return rows.length > 0;
}

async function userOf(key: string) {
  const [row] = await withDb((db) =>
    db
      .select()
      .from(users)
      .where(eq(users.lineUserId, `${LINE_PREFIX}-${key}`)),
  );
  return row;
}

/**
 * テストデータを消す。承認待ちは件数がナビのバッジに出るため、他のテストが残した申請も含めて全件消し、
 * 「申請なし」を前提にする（後続の画面テストへバッジ表示が影響しないようにもする）。
 * ユーザー・インストラクターはこのテストが作ったものだけを消す。
 */
async function cleanup(): Promise<void> {
  await withDb(async (db) => {
    await db.delete(accessRequests);
    await db.delete(users).where(like(users.lineUserId, `${LINE_PREFIX}-%`));
    await db.delete(instructors).where(eq(instructors.lastName, INSTRUCTOR_LAST_NAME));
  });
}

/** ナビの「ユーザー」リンクを返す。モバイルでは「その他」ドロワーを開いてから探す */
async function openUsersNavLink(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'その他' }).click();
  const drawer = page.getByRole('dialog', { name: 'その他' });
  return { drawer, link: drawer.getByRole('link', { name }) };
}

/** ドロワーを閉じて画面操作に戻る */
async function closeDrawer(page: Page) {
  await page.getByRole('button', { name: 'メニューを閉じる' }).click();
  await expect(page.getByRole('dialog', { name: 'その他' })).toBeHidden();
}

test.beforeEach(cleanup);
test.afterEach(cleanup);

test.describe('admin', () => {
  test.use({ storageState: authStatePath('admin') });

  test('承認待ちを承認・却下でき、件数バッジが更新される', async ({ page }) => {
    // 位置を持つ申請・持たない申請・紐付け承認用・単体却下用・一括却下用
    const withLocation = await seedRequest('a', {
      country: 'JP',
      region: 'Hokkaido',
      city: 'Sapporo',
    });
    const noLocation = await seedRequest('b');
    const toReject = await seedRequest('c');
    const batch1 = await seedRequest('d');
    const batch2 = await seedRequest('e');
    // 承認時に選ぶ ACTIVE の未紐付けインストラクター
    const instructorId = crypto.randomUUID();
    await withDb((db) =>
      db.insert(instructors).values({
        id: instructorId,
        lastName: INSTRUCTOR_LAST_NAME,
        firstName: '太郎',
        status: 'ACTIVE',
      }),
    );

    // 非表示のパネルも DOM に残るため、承認待ちの確認はパネルに限定する
    const pendingPanel = page.getByRole('tabpanel', { name: /承認待ち/ });
    await page.goto('/users');
    // 初期タブは「ユーザー」
    await expect(page.getByRole('tab', { name: 'ユーザー', selected: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toBeVisible();

    // バッジは申請がある間だけ件数を表示する（件数は他のデータを含み得るため数字の有無で確認する）
    {
      const { link } = await openUsersNavLink(page, /^ユーザー\s*\d+$/);
      await expect(link).toBeVisible();
      await closeDrawer(page);
    }

    await page.getByRole('tab', { name: /承認待ち/ }).click();
    await expect(pendingPanel.getByText(withLocation, { exact: true })).toBeVisible();
    await expect(pendingPanel.getByText('位置（目安）: JP Hokkaido Sapporo')).toBeVisible();
    // 位置情報がない申請は「不明」と表示する
    const noLocationRow = pendingPanel.getByText(noLocation, { exact: true }).locator('..');
    await expect(noLocationRow.getByText('位置（目安）: 不明')).toBeVisible();

    // インストラクターを紐付けて承認する
    await page.getByRole('button', { name: `${withLocation}を承認` }).click();
    const approveDialog = page.getByRole('dialog', { name: '利用申請を承認' });
    await approveDialog.getByRole('combobox', { name: /インストラクター紐付け/ }).fill(RUN);
    await page.getByRole('option', { name: new RegExp(INSTRUCTOR_LAST_NAME) }).click();
    const approved = page.waitForResponse(
      (response) => response.url().includes('/approve') && response.request().method() === 'POST',
    );
    await approveDialog.getByRole('button', { name: '承認する', exact: true }).click();
    expect((await approved).status()).toBe(201);
    await expect(approveDialog).toBeHidden();
    await expect(pendingPanel.getByText(withLocation, { exact: true })).toHaveCount(0);
    expect(await requestExists('a')).toBe(false);
    expect(await userOf('a')).toMatchObject({ role: 'MEMBER', isActive: true, instructorId });

    // 紐付けなしで承認する
    await page.getByRole('button', { name: `${noLocation}を承認` }).click();
    const approveDialog2 = page.getByRole('dialog', { name: '利用申請を承認' });
    const approved2 = page.waitForResponse(
      (response) => response.url().includes('/approve') && response.request().method() === 'POST',
    );
    await approveDialog2.getByRole('button', { name: '承認する', exact: true }).click();
    expect((await approved2).status()).toBe(201);
    await expect(pendingPanel.getByText(noLocation, { exact: true })).toHaveCount(0);
    expect(await userOf('b')).toMatchObject({ role: 'MEMBER', isActive: true, instructorId: null });

    // 承認したユーザーは「ユーザー」タブにも現れる
    await page.getByRole('tab', { name: 'ユーザー', exact: true }).click();
    // 一覧はデスクトップ表とモバイル表示の両方を描画するため、どちらかに存在することを確認する
    await expect(
      page.getByRole('tabpanel', { name: 'ユーザー' }).getByText(withLocation).first(),
    ).toBeAttached();
    await page.getByRole('tab', { name: /承認待ち/ }).click();

    // 単体却下は確認ダイアログを挟み、キャンセルでは削除されない
    await page.getByRole('button', { name: `${toReject}を却下` }).click();
    const rejectDialog = page.getByRole('dialog', { name: '利用申請を却下' });
    await rejectDialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(rejectDialog).toBeHidden();
    expect(await requestExists('c')).toBe(true);
    await page.getByRole('button', { name: `${toReject}を却下` }).click();
    const rejected = page.waitForResponse((response) => response.request().method() === 'DELETE');
    await rejectDialog.getByRole('button', { name: '却下する', exact: true }).click();
    expect((await rejected).status()).toBe(204);
    await expect(pendingPanel.getByText(toReject, { exact: true })).toHaveCount(0);
    expect(await requestExists('c')).toBe(false);

    // 選択した申請の一括却下も確認を挟み、選んだ申請だけを削除する
    await page.getByRole('checkbox', { name: `${batch1}を選択` }).check();
    await page.getByRole('checkbox', { name: `${batch2}を選択` }).check();
    await page.getByRole('button', { name: /選択した申請を却下/ }).click();
    const batchDialog = page.getByRole('dialog', { name: '利用申請を却下' });
    await expect(batchDialog.getByText(batch1)).toBeVisible();
    const batchRejected = page.waitForResponse((response) =>
      response.url().endsWith('/reject-batch'),
    );
    await batchDialog.getByRole('button', { name: '却下する', exact: true }).click();
    expect((await batchRejected).status()).toBe(200);
    await expect(pendingPanel.getByText(batch1, { exact: true })).toHaveCount(0);
    expect(await requestExists('d')).toBe(false);
    expect(await requestExists('e')).toBe(false);

    // 申請がなくなるとバッジは消える
    await expect(pendingPanel.getByText('承認待ちの申請はありません')).toBeVisible();
    await page.getByRole('tab', { name: 'ユーザー', exact: true }).click();
    {
      const { link } = await openUsersNavLink(page, /^ユーザー$/);
      await expect(link).toBeVisible();
      await closeDrawer(page);
    }
  });
});

test.describe('manager', () => {
  test.use({ storageState: authStatePath('manager') });

  test('承認待ちのタブ・バッジを表示せず、申請 API も拒否される', async ({ page }) => {
    const name = await seedRequest('m');
    const adminRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/access-requests')) adminRequests.push(request.url());
    });

    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /承認待ち/ })).toHaveCount(0);
    await expect(page.getByText(name)).toHaveCount(0);
    const { link } = await openUsersNavLink(page, /^ユーザー$/);
    await expect(link).toBeVisible();
    await closeDrawer(page);
    expect(adminRequests).toEqual([]);

    expect((await page.request.get('/api/access-requests')).status()).toBe(403);
    expect(
      (await page.request.post('/api/access-requests/missing/approve', { data: {} })).status(),
    ).toBe(403);
    expect((await page.request.delete('/api/access-requests/missing')).status()).toBe(403);
    expect(
      (
        await page.request.post('/api/access-requests/reject-batch', {
          data: { ids: ['missing'] },
        })
      ).status(),
    ).toBe(403);
    expect(await requestExists('m')).toBe(true);
  });
});

test.describe('member', () => {
  test.use({ storageState: authStatePath('member') });

  test('ユーザー画面に入れず、申請 API も拒否される', async ({ page, playwright }) => {
    await seedRequest('n');
    await page.goto('/users');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('tab', { name: /承認待ち/ })).toHaveCount(0);

    expect((await page.request.get('/api/access-requests')).status()).toBe(403);
    expect(
      (await page.request.post('/api/access-requests/missing/approve', { data: {} })).status(),
    ).toBe(403);
    expect((await page.request.delete('/api/access-requests/missing')).status()).toBe(403);
    expect(await requestExists('n')).toBe(true);

    const anonymous = await playwright.request.newContext({
      baseURL: E2E_BASE_URL,
      // test.use の認証状態を引き継がず、未認証で呼ぶ
      storageState: { cookies: [], origins: [] },
    });
    try {
      const res = await anonymous.get('/api/access-requests');
      expect(res.status(), await res.text()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
  });
});

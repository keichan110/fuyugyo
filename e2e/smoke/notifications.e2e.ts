import type { Locator, Page, Route } from '@playwright/test';

import { E2E_FIXED_NOW } from '../env.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import {
  notificationTitle,
  OTHER_USER_NOTIFICATION_TITLE,
  readShiftRelatedRecords,
  resetNotifications,
  resetPublicationDraft,
} from '../fixtures/business-data.ts';
import { BUSINESS_DATE } from '../fixtures/business-date.ts';
import { blockExternalRequests } from '../fixtures/network.ts';
import { expect, test } from '../fixtures/test.ts';

const isListRequest = (url: URL) => url.pathname === '/api/notifications/me';
const isNextPageRequest = (url: URL) => isListRequest(url) && url.searchParams.has('cursor');
const isReadRequest = (url: URL) => /^\/api\/notifications\/[^/]+\/read$/.test(url.pathname);

/** 新しい順の番号の範囲を、件名の並びにする。 */
const titles = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => notificationTitle(from + index));

const inboxOf = (page: Page) => page.getByRole('region', { name: 'お知らせ', exact: true });
const rowOf = (scope: Locator, number: number) =>
  scope.getByRole('article', { name: notificationTitle(number), exact: true });
const rowHeadingsOf = (scope: Locator) => scope.getByRole('heading', { level: 3 });
const readButtonOf = (scope: Locator) =>
  scope.getByRole('button', { name: '既読にする', exact: true });
const retryButtonOf = (scope: Locator) =>
  scope.getByRole('button', { name: '再試行', exact: true });
const moreButtonOf = (scope: Locator) =>
  scope.getByRole('button', { name: 'もっと見る', exact: true });

/** 失敗させる間だけ API をエラー応答にし、それ以外は実際の API へ通す。 */
const failWhile = (isFailing: () => boolean) => async (route: Route) => {
  if (isFailing()) await route.fulfill({ status: 500, json: { message: 'E2E障害' } });
  else await route.fallback();
};

/** テストが開くまで通信を止めておくための待ち合わせを作る。 */
function createGate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

test.describe('お知らせの受信箱', () => {
  test.use({ storageState: authStatePath('member') });
  test.beforeEach(async () => resetNotifications());

  test(
    'トップは本人の未読5件と未読総数を示し、履歴は20件ずつ表示する',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto('/');
      const inbox = inboxOf(page);
      await expect(rowHeadingsOf(inbox)).toHaveText(titles(1, 5));
      await expect(inbox.getByText('未読 7件', { exact: true })).toBeVisible();
      await expect(page.getByText(OTHER_USER_NOTIFICATION_TITLE)).toHaveCount(0);

      await inbox.getByRole('link', { name: 'すべて見る', exact: true }).click();
      await expect(page).toHaveURL('/notifications');
      const history = page.getByRole('main');
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 20));
      await expect(rowOf(history, 1)).toContainText('2026/01/14 09:00 · 未読');
      await expect(rowOf(history, 7)).toContainText('· 既読');

      await moreButtonOf(history).press('Enter');
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 25));
      // 押したボタンが消えても、追加された先頭の行から読み進められる
      await expect(rowOf(history, 21)).toBeFocused();
      await expect(moreButtonOf(history)).toHaveCount(0);
      await expect(page.getByText(OTHER_USER_NOTIFICATION_TITLE)).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    },
  );

  test(
    '既読は明示した操作だけで行い、再読込と再ログイン後も保つ',
    { tag: '@smoke' },
    async ({ page, browser }) => {
      const readRequests: string[] = [];
      page.on('request', (request) => {
        if (isReadRequest(new URL(request.url()))) readRequests.push(request.url());
      });
      const recordsBefore = await readShiftRelatedRecords();

      await page.goto('/');
      const inbox = inboxOf(page);
      await rowOf(inbox, 1).getByRole('link', { name: '関連画面を開く', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'シフト表', exact: true })).toBeVisible();
      await page.goto('/');
      await expect(rowOf(inbox, 1)).toContainText('· 未読');
      await expect(inbox.getByText('未読 7件', { exact: true })).toBeVisible();
      expect(readRequests).toEqual([]);

      await readButtonOf(rowOf(inbox, 1)).press('Enter');
      await expect(rowHeadingsOf(inbox)).toHaveText(titles(2, 6));
      await expect(inbox.getByText('未読 6件', { exact: true })).toBeVisible();
      await expect(inbox.getByRole('heading', { name: 'お知らせ', exact: true })).toBeFocused();

      await inbox.getByRole('link', { name: 'すべて見る', exact: true }).click();
      const history = page.getByRole('main');
      await expect(rowOf(history, 1)).toContainText('· 既読');
      await expect(readButtonOf(rowOf(history, 1))).toHaveCount(0);

      // 2ページ目を既読にしても、読み込み済みの行は残る
      await moreButtonOf(history).click();
      await readButtonOf(rowOf(history, 22)).press('Enter');
      await expect(rowOf(history, 22)).toContainText('· 既読');
      await expect(rowOf(history, 22)).toBeFocused();
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 25));

      await page.reload();
      await expect(rowOf(history, 1)).toContainText('· 既読');

      // 再ログインに相当する、認証情報だけを読み込んだ新しいブラウザーで保存結果を確かめる
      const relogin = await browser.newContext({ storageState: authStatePath('member') });
      try {
        await blockExternalRequests(relogin);
        const reloginPage = await relogin.newPage();
        await reloginPage.clock.setFixedTime(E2E_FIXED_NOW);
        await reloginPage.goto('/notifications');
        const reloginHistory = reloginPage.getByRole('main');
        await expect(rowOf(reloginHistory, 1)).toContainText('· 既読');
        await moreButtonOf(reloginHistory).click();
        await expect(rowOf(reloginHistory, 22)).toContainText('· 既読');
        await reloginPage.goto('/');
        await expect(inboxOf(reloginPage).getByText('未読 5件', { exact: true })).toBeVisible();
      } finally {
        await relogin.close();
      }
      expect(await readShiftRelatedRecords()).toEqual(recordsBefore);
    },
  );

  test(
    '追加読み込み中に既読にしても、古い取得結果で表示が戻らない',
    { tag: '@smoke' },
    async ({ page }) => {
      const gate = createGate();
      await page.route(isNextPageRequest, async (route) => {
        await gate.opened;
        await route.fallback();
      });
      await page.goto('/notifications');
      const history = page.getByRole('main');
      const nextPageRequest = page.waitForRequest((request) =>
        isNextPageRequest(new URL(request.url())),
      );
      await moreButtonOf(history).click();
      await nextPageRequest;

      await readButtonOf(rowOf(history, 1)).press('Enter');
      await expect(rowOf(history, 1)).toContainText('· 既読');
      const staleResponse = page.waitForResponse((response) =>
        isNextPageRequest(new URL(response.url())),
      );
      gate.open();
      await staleResponse;

      await expect(moreButtonOf(history)).toBeEnabled();
      await expect(rowHeadingsOf(history)).toHaveCount(20);
      await moreButtonOf(history).click();
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 25));
      await expect(rowOf(history, 1)).toContainText('· 既読');
    },
  );

  test(
    '読み込み中と取得失敗を区別し、キーボードで再試行できる',
    { tag: '@smoke' },
    async ({ page }) => {
      let failing = true;
      const gate = createGate();
      const respond = failWhile(() => failing);
      await page.route(isListRequest, async (route) => {
        await gate.opened;
        await respond(route);
      });

      await page.goto('/');
      const inbox = inboxOf(page);
      const emptyMessage = inbox.getByText('お知らせはありません', { exact: true });
      await expect(inbox.getByText('お知らせを読み込み中', { exact: true })).toBeVisible();
      await expect(emptyMessage).toHaveCount(0);

      gate.open();
      await expect(
        inbox.getByText('お知らせを取得できませんでした', { exact: true }),
      ).toBeVisible();
      await expect(emptyMessage).toHaveCount(0);

      failing = false;
      await retryButtonOf(inbox).press('Enter');
      await expect(rowHeadingsOf(inbox)).toHaveText(titles(1, 5));
      await expect(inbox.getByRole('heading', { name: 'お知らせ', exact: true })).toBeFocused();
    },
  );

  test(
    '既読と続きの取得に失敗しても表示を保ち、キーボードで再試行できる',
    { tag: '@smoke' },
    async ({ page }) => {
      let readFailing = true;
      let nextPageFailing = true;
      await page.route(
        isReadRequest,
        failWhile(() => readFailing),
      );
      await page.route(
        isNextPageRequest,
        failWhile(() => nextPageFailing),
      );

      await page.goto('/');
      const inbox = inboxOf(page);
      const row = rowOf(inbox, 1);
      await readButtonOf(row).press('Enter');
      await expect(row.getByText('既読にできませんでした', { exact: true })).toBeVisible();
      await expect(row).toContainText('· 未読');
      await expect(inbox.getByText('未読 7件', { exact: true })).toBeVisible();
      await expect(retryButtonOf(row)).toBeFocused();

      readFailing = false;
      await page.keyboard.press('Enter');
      await expect(inbox.getByText('未読 6件', { exact: true })).toBeVisible();
      await expect(row).toHaveCount(0);
      await expect(inbox.getByRole('heading', { name: 'お知らせ', exact: true })).toBeFocused();

      await inbox.getByRole('link', { name: 'すべて見る', exact: true }).click();
      const history = page.getByRole('main');
      await moreButtonOf(history).press('Enter');
      await expect(
        history.getByText('続きのお知らせを取得できませんでした', { exact: true }),
      ).toBeVisible();
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 20));
      await expect(retryButtonOf(history)).toBeFocused();

      nextPageFailing = false;
      await page.keyboard.press('Enter');
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 25));
      await expect(rowOf(history, 21)).toBeFocused();
    },
  );

  test(
    '未読がなく履歴があれば、そのことを示して履歴へ案内する',
    { tag: '@smoke' },
    async ({ page }) => {
      await resetNotifications({ allRead: true });
      await page.goto('/');
      const inbox = inboxOf(page);
      await expect(inbox.getByText('未読のお知らせはありません', { exact: true })).toBeVisible();
      await expect(inbox.getByText('お知らせはありません', { exact: true })).toHaveCount(0);
      await expect(inbox.getByRole('article')).toHaveCount(0);

      await inbox.getByRole('link', { name: 'すべて見る', exact: true }).click();
      const history = page.getByRole('main');
      await expect(rowHeadingsOf(history)).toHaveText(titles(1, 20));
      await expect(readButtonOf(history)).toHaveCount(0);
    },
  );
});

test.describe('シフト公開のお知らせ', () => {
  test.use({ storageState: authStatePath('manager') });
  test.beforeEach(async () => resetPublicationDraft());

  test(
    'シフトを公開すると担当者の受信箱に届き、公開日を開いて既読にできる',
    { tag: '@smoke' },
    async ({ page, browser }) => {
      // 2ロールの複数画面を通すため、単一操作のテストより長い実行枠を確保する。
      test.setTimeout(60_000);
      const member = await browser.newContext({ storageState: authStatePath('member') });
      try {
        await blockExternalRequests(member);
        const memberPage = await member.newPage();
        await memberPage.clock.setFixedTime(`${BUSINESS_DATE}T09:00:00+09:00`);
        await page.clock.setFixedTime(`${BUSINESS_DATE}T09:00:00+09:00`);

        await page.goto('/shifts/manage?department=ski');
        await page
          .getByRole('button', {
            name: new RegExp(`${Number(BUSINESS_DATE.slice(5, 7))}/20.*の割り当てを編集`),
          })
          .click();
        await page.getByRole('switch', { name: 'この枠をメンバーに公開' }).click();
        await page
          .getByRole('dialog', { name: 'この枠を公開しますか？' })
          .getByRole('button', { name: '公開する', exact: true })
          .click();
        await expect(page.getByRole('switch', { name: 'この枠をメンバーに公開' })).toBeChecked();

        await memberPage.goto('/');
        const inbox = inboxOf(memberPage);
        const row = inbox.getByRole('article', { name: 'シフトが公開されました', exact: true });
        await expect(row).toContainText(`${BUSINESS_DATE} / スキー / 一般レッスン`);
        await expect(row).toContainText('· 未読');
        await expect(inbox.getByText('未読 1件', { exact: true })).toBeVisible();

        await row.getByRole('link', { name: '関連画面を開く', exact: true }).click();
        await expect(memberPage).toHaveURL(new RegExp(`/shifts\\?.*date=${BUSINESS_DATE}`));
        await expect(
          memberPage.getByRole('button', { name: /一般レッスン.*鈴木 次郎/ }),
        ).toBeVisible();

        await memberPage.goto('/');
        await readButtonOf(row).click();
        await expect(inbox.getByText('未読のお知らせはありません', { exact: true })).toBeVisible();
        await inbox.getByRole('link', { name: 'すべて見る', exact: true }).click();
        await expect(
          memberPage
            .getByRole('main')
            .getByRole('article', { name: 'シフトが公開されました', exact: true }),
        ).toContainText('· 既読');
      } finally {
        await member.close();
      }
    },
  );
});

test.describe('お知らせがない利用者', () => {
  // fixture は ADMIN 宛てを投入しないため、他のユーザーに通知があっても全件なしになる
  test.use({ storageState: authStatePath('admin') });
  test.beforeEach(async () => resetNotifications());

  test('お知らせが1件もないことを示す', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');
    const inbox = inboxOf(page);
    await expect(inbox.getByText('お知らせはありません', { exact: true })).toBeVisible();
    await expect(inbox.getByRole('article')).toHaveCount(0);
    await expect(inbox.getByRole('link', { name: 'すべて見る', exact: true })).toHaveCount(0);

    await page.goto('/notifications');
    const history = page.getByRole('main');
    await expect(history.getByText('お知らせはありません', { exact: true })).toBeVisible();
    await expect(history.getByRole('article')).toHaveCount(0);
    await expect(moreButtonOf(history)).toHaveCount(0);
  });
});

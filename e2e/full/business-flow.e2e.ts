import {
  availabilityListResponseSchema,
  availabilityListSchema,
} from '../../src/features/availabilities/schema.ts';
import { shiftListSchema } from '../../src/features/shifts/schema.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import { resetBusinessData } from '../fixtures/business-data.ts';
import { BUSINESS_DATE, BUSINESS_DATE_LABEL, BUSINESS_MONTH } from '../fixtures/business-date.ts';
import { blockExternalRequests } from '../fixtures/network.ts';
import { expect, test } from '../fixtures/test.ts';
import { E2E_LINKED_INSTRUCTOR_IDS } from '../fixtures/users.ts';

test.use({ storageState: authStatePath('manager') });
test.beforeEach(async () => resetBusinessData());

test('勤務可否の申告からシフトの新規作成・割当・公開・本人確認まで通る', async ({
  page,
  browser,
}) => {
  // 2ロールの複数画面を通すため、単一操作のテストより長い実行枠を確保する。
  test.setTimeout(60_000);
  // 端末・baseURL等はPlaywrightが現在のテスト設定から継承し、認証状態だけを変更する。
  const member = await browser.newContext({
    storageState: authStatePath('member'),
  });
  try {
    await blockExternalRequests(member);
    const memberPage = await member.newPage();
    await memberPage.clock.setFixedTime(`${BUSINESS_DATE}T09:00:00+09:00`);
    await page.clock.setFixedTime(`${BUSINESS_DATE}T09:00:00+09:00`);

    // 自社APIをモックせず、申告した状態とメモがD1に保存されることを確認する。
    await memberPage.goto(`/availabilities?month=${BUSINESS_MONTH}`);
    await memberPage.getByRole('button', { name: BUSINESS_DATE_LABEL, exact: true }).click();
    await memberPage.getByRole('combobox', { name: '状態', exact: true }).click();
    await memberPage.getByRole('option', { name: '勤務可', exact: false }).click();
    await memberPage.getByRole('textbox', { name: 'メモ', exact: true }).fill('E2E勤務希望');
    await memberPage.getByRole('button', { name: '反映', exact: true }).click();
    await memberPage.getByRole('button', { name: '変更を保存', exact: true }).click();
    await expect(memberPage.getByText('未保存の変更')).toBeHidden();
    await memberPage.reload();
    await expect(
      memberPage.getByRole('button', { name: BUSINESS_DATE_LABEL, exact: true }),
    ).toHaveAttribute('data-availability', 'AVAILABLE');
    const range = { from: BUSINESS_DATE, to: BUSINESS_DATE };
    const own = await member.request.get('/api/availabilities/me', { params: range });
    expect(own.ok()).toBe(true);
    expect(availabilityListResponseSchema.parse(await own.json()).availabilities).toContainEqual({
      instructorId: E2E_LINKED_INSTRUCTOR_IDS.member,
      date: BUSINESS_DATE,
      type: 'AVAILABLE',
      note: 'E2E勤務希望',
    });
    const visibleToManager = await page.request.get('/api/availabilities', { params: range });
    expect(visibleToManager.ok()).toBe(true);
    expect(availabilityListSchema.parse(await visibleToManager.json())).toContainEqual({
      instructorId: E2E_LINKED_INSTRUCTOR_IDS.member,
      date: BUSINESS_DATE,
      type: 'AVAILABLE',
      note: 'E2E勤務希望',
    });

    await page.goto('/shifts/manage?department=ski');
    const editDay = page.getByRole('button', {
      name: new RegExp(`${Number(BUSINESS_DATE.slice(5, 7))}/20.*の割り当てを編集`),
    });
    await editDay.click();
    await expect(page.getByRole('checkbox', { name: '鈴木 次郎' })).toHaveAccessibleDescription(
      /E2E勤務希望/,
    );
    await page.getByRole('checkbox', { name: '鈴木 次郎' }).check();
    await page.getByRole('button', { name: '下書きを保存' }).click();
    await expect(page.getByText('未保存の変更')).toBeHidden();
    await page.reload();
    await editDay.click();
    await expect(page.getByRole('checkbox', { name: '鈴木 次郎' })).toBeChecked();

    // 公開前のAPIと画面の両方で、MEMBERへ下書きを漏らさない。
    const query = { dateFrom: BUSINESS_DATE, dateTo: BUSINESS_DATE };
    const beforePublish = await member.request.get('/api/shifts', { params: query });
    expect(beforePublish.ok()).toBe(true);
    expect(shiftListSchema.parse(await beforePublish.json())).toEqual([]);
    await memberPage.goto(`/shifts?date=${BUSINESS_DATE}`);
    await expect(memberPage.getByRole('heading', { name: 'シフト表', exact: true })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: /一般レッスン.*鈴木 次郎/ })).toHaveCount(
      0,
    );

    await page.getByRole('switch', { name: 'この枠をメンバーに公開' }).click();
    await page
      .getByRole('dialog', { name: 'この枠を公開しますか？' })
      .getByRole('button', { name: '公開する', exact: true })
      .click();
    await expect(page.getByRole('switch', { name: 'この枠をメンバーに公開' })).toBeChecked();
    const published = await member.request.get('/api/shifts', { params: query });
    expect(published.ok()).toBe(true);
    expect(shiftListSchema.parse(await published.json())).toEqual([
      expect.objectContaining({
        status: 'PUBLISHED',
        assignedInstructorIds: [E2E_LINKED_INSTRUCTOR_IDS.member],
      }),
    ]);
    await memberPage.reload();
    await expect(memberPage.getByRole('button', { name: /一般レッスン.*鈴木 次郎/ })).toBeVisible();
    await memberPage.goto(`/availabilities?month=${BUSINESS_MONTH}`);
    await expect(
      memberPage.getByRole('button', {
        name: `${BUSINESS_DATE_LABEL}（公開済みシフトのため編集不可）`,
        exact: true,
      }),
    ).toBeDisabled();
  } finally {
    await member.close();
  }
});

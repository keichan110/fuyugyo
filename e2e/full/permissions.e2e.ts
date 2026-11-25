import { userSchema } from '../../src/features/users/schema.ts';
import { E2E_BASE_URL } from '../env.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import { resetBusinessData, ROLE_TARGET_ID } from '../fixtures/business-data.ts';
import { expect, test } from '../fixtures/test.ts';
import { E2E_USERS } from '../fixtures/users.ts';

test.describe('member の禁止操作', () => {
  test.use({ storageState: authStatePath('member') });
  test.beforeEach(async () => resetBusinessData());

  test('MANAGER 以上限定の画面・ロール変更・無効化を拒否し、ユーザーを変更しない', async ({
    page,
    playwright,
  }) => {
    await page.goto('/users');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toHaveCount(0);
    expect((await page.request.get('/api/users')).status()).toBe(403);
    expect(
      (
        await page.request.post(`/api/users/${ROLE_TARGET_ID}/change-role`, {
          data: { role: 'ADMIN' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post(`/api/users/${ROLE_TARGET_ID}/deactivate`, {
          data: {},
        })
      ).status(),
    ).toBe(403);
    const admin = await playwright.request.newContext({
      baseURL: E2E_BASE_URL,
      storageState: authStatePath('admin'),
    });
    try {
      const target = await admin.get(`/api/users/${ROLE_TARGET_ID}`);
      expect(target.ok()).toBe(true);
      expect(userSchema.parse(await target.json())).toMatchObject({
        role: 'MEMBER',
        isActive: true,
      });
    } finally {
      await admin.dispose();
    }
  });
});

test.describe('manager のユーザー管理', () => {
  test.use({ storageState: authStatePath('manager') });
  test.beforeEach(async () => resetBusinessData());

  test('ユーザー管理を開けるが、ロール変更と ADMIN の無効化は拒否される', async ({
    page,
    playwright,
  }) => {
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'ユーザー管理' })).toBeVisible();
    expect(
      (
        await page.request.post(`/api/users/${ROLE_TARGET_ID}/change-role`, {
          data: { role: 'ADMIN' },
        })
      ).status(),
    ).toBe(403);
    const adminUser = E2E_USERS.find((user) => user.key === 'admin');
    if (!adminUser) throw new Error('E2E の ADMIN ユーザーが必要です');
    expect(
      (await page.request.post(`/api/users/${adminUser.id}/deactivate`, { data: {} })).status(),
    ).toBe(403);
    const admin = await playwright.request.newContext({
      baseURL: E2E_BASE_URL,
      storageState: authStatePath('admin'),
    });
    try {
      const target = await admin.get(`/api/users/${ROLE_TARGET_ID}`);
      expect(userSchema.parse(await target.json())).toMatchObject({ role: 'MEMBER' });
    } finally {
      await admin.dispose();
    }
  });
});

test.describe('MEMBER の管理操作', () => {
  test.use({ storageState: authStatePath('member') });
  test('直接URLと書込APIの両方でシフト管理・招待発行を拒否する', async ({ page }) => {
    await page.goto('/shifts/manage');
    await expect(page).toHaveURL('/');
    expect(
      (
        await page.request.put('/api/shifts/assignments', {
          data: { month: '2026-01', departmentCode: 'ski', cells: [] },
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.post('/api/invitations', { data: {} })).status()).toBe(403);
    expect((await page.request.get('/api/invitations')).status()).toBe(403);
  });
});

test.describe('無効ユーザー', () => {
  test.use({ storageState: authStatePath('inactive') });
  test('保護APIの参照と書込みが403になる', async ({ request }) => {
    expect((await request.get('/api/shifts')).status()).toBe(403);
    expect((await request.put('/api/availabilities/me', { data: { changes: [] } })).status()).toBe(
      403,
    );
  });
});

test.describe('ADMIN のユーザー管理', () => {
  test.use({ storageState: authStatePath('admin') });
  test.beforeEach(async () => resetBusinessData());
  test('専用ユーザーのロールを変更して再読み込みしても保持する', async ({ page }) => {
    await page.goto('/users');
    await page.getByPlaceholder('ユーザー名で検索').fill('E2E権限変更対象');
    await page.getByRole('button', { name: '編集', exact: true }).filter({ visible: true }).click();
    const drawer = page.getByRole('dialog', { name: 'ユーザーを編集' });
    await drawer.getByRole('combobox', { name: 'ロール', exact: true }).click();
    await page.getByRole('option', { name: 'マネージャー', exact: true }).click();
    await drawer.getByRole('button', { name: '保存', exact: true }).click();
    await expect(drawer).toBeHidden();
    await page.reload();
    await page.getByPlaceholder('ユーザー名で検索').fill('E2E権限変更対象');
    await page.getByRole('button', { name: '編集', exact: true }).filter({ visible: true }).click();
    await expect(drawer.getByRole('combobox', { name: 'ロール', exact: true })).toHaveValue(
      'マネージャー',
    );
    const target = await page.request.get(`/api/users/${ROLE_TARGET_ID}`);
    expect(target.ok()).toBe(true);
    expect(userSchema.parse(await target.json()).role).toBe('MANAGER');
  });
});

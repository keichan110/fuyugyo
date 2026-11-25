import { shiftAgendaResponseSchema } from '../../src/features/shifts/schema.ts';
import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

for (const role of ['member', 'manager', 'admin'] as const) {
  test.describe(`${role} のモバイルナビゲーション`, () => {
    test.use({ storageState: authStatePath(role) });

    test('権限に応じた固定タブとその他メニューを表示する', { tag: '@smoke' }, async ({ page }) => {
      await page.goto('/');
      const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
      const labels =
        role === 'member'
          ? ['ホーム', 'シフト表', 'シフト希望']
          : ['ホーム', 'シフト表', 'シフト希望', 'シフト管理'];
      await expect(navigation.getByRole('link')).toHaveCount(labels.length);
      for (const [index, label] of labels.entries()) {
        await expect(navigation.getByRole('link').nth(index)).toHaveAccessibleName(label);
      }
      await expect(page.getByRole('button', { name: 'ナビゲーションを開く' })).toBeHidden();
      await navigation.getByRole('button', { name: 'その他' }).click();
      const drawer = page.getByRole('dialog', { name: 'その他' });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('link', { name: 'ホーム', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('link', { name: 'シフト表', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('link', { name: 'シフト希望', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('link', { name: 'シフト管理', exact: true })).toHaveCount(0);
      await expect(drawer.getByRole('button', { name: 'ログアウト' })).toBeVisible();
      await expect(drawer.getByRole('link', { name: 'ユーザー', exact: true })).toHaveCount(
        role === 'member' ? 0 : 1,
      );
      await expect(drawer.getByRole('link', { name: '招待', exact: true })).toHaveCount(0);
      if (role !== 'member') {
        await drawer.getByRole('link', { name: '資格', exact: true }).click();
        await expect(drawer).toBeHidden();
        await expect(navigation.getByRole('button', { name: 'その他' })).toHaveAttribute(
          'data-active',
          'true',
        );
      }
    });

    test('未紐付けでもタブ数を保ち、シフト表を閲覧できる', async ({ page }) => {
      // 認証APIの境界で未紐付け状態を再現し、共有D1のユーザー情報は変更しない。
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const user = await response.json();
        await route.fulfill({ response, json: { ...user, instructorId: null } });
      });
      await page.goto('/');
      const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
      await expect(navigation.getByRole('link')).toHaveCount(role === 'member' ? 2 : 3);
      await expect(navigation.getByRole('button', { name: /シフト希望/ })).toBeDisabled();
      await expect(navigation.getByRole('button', { name: /シフト希望/ })).toHaveAccessibleName(
        'シフト希望（インストラクターの方は、管理者に連携を依頼してください）',
      );
      await expect(
        navigation.getByRole('button', { name: /シフト希望/ }).locator('.tabler-icon-lock'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^(連携|紐付け)/ })).toHaveCount(0);
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
      await expect(page.getByText('インストラクターへの紐付けが必要です')).toBeVisible();
      await expect(
        page.getByText('インストラクターの方は、管理者に連携を依頼してください。'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^(連携|紐付け)/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '一括設定' })).toHaveCount(0);
      expect(availabilityRequested).toBe(false);

      await navigation.getByRole('button', { name: 'その他' }).click();
      await expect(
        page
          .getByRole('dialog', { name: 'その他' })
          .getByText('インストラクターの方は、管理者に連携を依頼してください', { exact: true }),
      ).toBeVisible();
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

for (const role of ['member', 'manager', 'admin'] as const) {
  test.describe(`${role} のPC版シフト希望メニュー`, () => {
    test.use({ storageState: authStatePath(role), viewport: { width: 1280, height: 800 } });

    test('サイドバーから希望を開け、未紐付け時は理由を付けて無効化する', async ({ page }) => {
      await page.goto('/');
      const link = page
        .getByRole('link', { name: 'シフト希望', exact: true })
        .filter({ visible: true });
      await expect(link).toHaveCount(1);
      await link.click();
      await expect(page.getByRole('heading', { name: 'シフト希望', exact: true })).toBeVisible();
      await expect(page.getByText('インストラクターへの紐付けが必要です')).toHaveCount(0);
      await expect(link).toHaveAttribute('data-active', 'true');
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const user = await response.json();
        await route.fulfill({ response, json: { ...user, instructorId: null } });
      });
      await page.reload();
      const disabled = page.getByRole('button', { name: /シフト希望/ }).filter({ visible: true });
      await expect(disabled).toBeDisabled();
      await expect(disabled).toContainText(
        'インストラクターの方は、管理者に連携を依頼してください',
      );
      await expect(link).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(連携|紐付け)/ })).toHaveCount(0);
    });
  });
}

test.describe('モバイルの固定領域と編集', () => {
  test.use({ storageState: authStatePath('admin'), viewport: { width: 320, height: 740 } });

  test('狭い幅でも5タブを収め、シフト管理だけを選択状態にする', async ({ page }) => {
    await page.goto('/shifts/manage');
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(navigation.getByRole('link', { name: 'シフト管理' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      navigation.getByRole('link', { name: 'シフト表', exact: true }),
    ).not.toHaveAttribute('aria-current');
    for (const tab of await navigation.locator('a, button').all()) {
      const bounds = await tab.boundingBox();
      expect(bounds).not.toBeNull();
      if (bounds) {
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
    }
    await page.emulateMedia({ media: 'print' });
    await expect(navigation).toBeHidden();
  });

  test('320px・iPhone SE幅で48px高のアイコンのみを表示し、選択は色だけで示す', async ({ page }) => {
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 667 });
      await expect(navigation).toBeVisible();
      for (const tab of await navigation.locator('a, button').all()) {
        await expect(tab).toHaveText('');
        const bounds = await tab.boundingBox();
        expect(bounds?.height).toBe(48);
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        await expect(tab.locator('svg')).toHaveCSS('height', '26px');
        await expect(tab).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      }
      const active = navigation.getByRole('link', { name: 'ホーム', exact: true });
      const inactive = navigation.getByRole('link', { name: 'シフト表', exact: true });
      const activeColor = await active.evaluate((element) => getComputedStyle(element).color);
      const inactiveColor = await inactive.evaluate((element) => getComputedStyle(element).color);
      expect(activeColor).not.toBe(inactiveColor);
      await expect(active.locator('svg')).toHaveCSS('color', activeColor);
      await navigation.getByRole('button', { name: 'その他' }).click();
      const more = navigation.getByRole('button', { name: 'その他' });
      await expect(more).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(more.locator('svg')).toHaveCSS('color', activeColor);
      await page.getByRole('button', { name: 'メニューを閉じる' }).click();
    }
  });

  test('未保存バーをタブの上に表示し、移動前に破棄を確認する', async ({ page }) => {
    await page.goto('/availabilities?month=2026-01');
    await page.getByRole('button', { name: '2026年1月20日', exact: true }).click();
    await page.getByRole('combobox', { name: '状態', exact: true }).click();
    await page.getByRole('option', { name: '勤務可', exact: false }).click();
    await page.getByRole('button', { name: '反映', exact: true }).click();
    const saveBar = page.getByRole('region').filter({ hasText: '未保存の変更' });
    await expect(saveBar).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    const barBounds = await saveBar.boundingBox();
    const navBounds = await navigation.boundingBox();
    expect(barBounds).not.toBeNull();
    expect(navBounds).not.toBeNull();
    if (barBounds && navBounds) {
      expect(barBounds.y + barBounds.height).toBeLessThanOrEqual(navBounds.y);
    }
    await navigation.getByRole('button', { name: 'その他' }).click();
    await expect(page.getByRole('dialog', { name: 'その他' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '未保存の変更があります' })).toBeHidden();
    await page.getByRole('button', { name: 'メニューを閉じる' }).click();
    await navigation.getByRole('link', { name: 'ホーム' }).click();
    await expect(page.getByRole('dialog', { name: '未保存の変更があります' })).toBeVisible();
    await page.getByRole('button', { name: 'このページに残る' }).click();
    await expect(saveBar).toBeVisible();
    await navigation.getByRole('link', { name: 'ホーム' }).click();
    await page.getByRole('button', { name: '破棄して移動' }).click();
    await expect(page).toHaveURL('/');
    await expect(saveBar).toBeHidden();
  });

  test('入力中に表示領域が縮むとタブを隠し、戻ると再表示する', async ({ page }) => {
    await page.goto('/instructors');
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(navigation).toBeVisible();
    // Chromiumエミュレーションにはソフトウェアキーボードがないため、公開ブラウザAPIの変化を再現する。
    const fullHeight = await page.evaluate(() => window.visualViewport?.height ?? 0);
    expect(fullHeight).toBeGreaterThan(0);
    await page.getByPlaceholder('氏名・カナで検索').focus();
    await page.evaluate((height) => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error('VisualViewport が必要です');
      Object.defineProperty(viewport, 'height', { configurable: true, value: height - 80 });
      viewport.dispatchEvent(new Event('resize'));
    }, fullHeight);
    await expect(navigation).toBeVisible();
    await page.evaluate((height) => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error('VisualViewport が必要です');
      Object.defineProperty(viewport, 'height', { configurable: true, value: height - 300 });
      viewport.dispatchEvent(new Event('resize'));
    }, fullHeight);
    await expect(navigation).toBeHidden();
    await page.evaluate((height) => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error('VisualViewport が必要です');
      Object.defineProperty(viewport, 'height', { configurable: true, value: height });
      viewport.dispatchEvent(new Event('resize'));
    }, fullHeight);
    await expect(navigation).toBeVisible();
  });
});

test.describe('シフト表の固定ボタン', () => {
  test.use({ storageState: authStatePath('admin'), viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    // シフト一覧APIの境界で長い画面を再現し、共有D1のシフトを増やさずスクロールを検証する。
    await page.route('**/api/shifts/agenda?**', async (route) => {
      const response = await route.fetch();
      const agenda = shiftAgendaResponseSchema.parse(await response.json());
      const source = agenda.days.at(0);
      if (!source) throw new Error('シフト表の検証にはseedの稼働日が必要です');
      const days = Array.from({ length: 12 }, (_, index) => {
        const date = `2026-01-${String(15 + index).padStart(2, '0')}`;
        return {
          date,
          shifts: source.shifts.map((shift) => ({ ...shift, id: `${shift.id}-${date}`, date })),
        };
      });
      await route.fulfill({
        response,
        json: {
          ...agenda,
          days,
          pageInfo: { ...agenda.pageInfo, nextCursor: null, previousCursor: null },
        },
      });
    });
  });

  for (const path of ['/', '/shifts']) {
    test(`${path}では下スクロールでタブを隠し、上スクロールで戻す`, async ({ page }) => {
      await page.goto(path);
      const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
      await expect(navigation).toBeVisible();
      if (path === '/shifts') await expect(page.getByText('1/16（金）')).toBeVisible();
      const padding = await page
        .locator('main')
        .evaluate((element) => getComputedStyle(element).paddingBottom);
      await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
      await expect(navigation).toBeHidden();
      expect(
        await page.locator('main').evaluate((element) => getComputedStyle(element).paddingBottom),
      ).toBe(padding);
      await page.evaluate(() => window.scrollBy({ top: -10, behavior: 'instant' }));
      await expect(navigation).toBeHidden();
      await page.evaluate(() => window.scrollBy({ top: -50, behavior: 'instant' }));
      await expect(navigation).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect(navigation).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
      await expect(navigation).toBeHidden();
      await page.evaluate(() => window.scrollBy({ top: -60, behavior: 'instant' }));
      await expect(navigation).toBeVisible();
      await navigation.getByRole('link', { name: 'シフト希望', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'シフト希望', exact: true })).toBeVisible();
      await expect(navigation).toBeVisible();
    });
  }

  test('上へ戻るボタンが下部タブと重ならず、先頭へ戻れる', async ({ page }) => {
    await page.goto('/shifts');
    await expect(page.getByText('1/16（金）')).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
    const backToTop = page.getByRole('button', { name: '↑ 上へ戻る' });
    await expect(backToTop).toBeVisible();
    // 表示完了後だけでなく、タブが復帰するアニメーション中も重ならないことを確認する。
    const overlap = await page.evaluate(async () => {
      const nav = document.querySelector('nav[aria-label="メインナビゲーション"]');
      const button = [...document.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('上へ戻る'),
      );
      if (!nav || !button) throw new Error('固定ボタンとタブが必要です');
      let maximumOverlap = -Infinity;
      const started = performance.now();
      window.scrollBy({ top: -60, behavior: 'instant' });
      await new Promise<void>((resolve) => {
        const sample = () => {
          maximumOverlap = Math.max(
            maximumOverlap,
            button.getBoundingClientRect().bottom - nav.getBoundingClientRect().top,
          );
          if (performance.now() - started < 250) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      return maximumOverlap;
    });
    expect(overlap).toBeLessThanOrEqual(0);
    const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(navigation).toBeVisible();
    await expect
      .poll(async () => {
        const button = await backToTop.boundingBox();
        const nav = await navigation.boundingBox();
        return button && nav ? button.y + button.height <= nav.y : false;
      })
      .toBe(true);
    await backToTop.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(navigation).toBeVisible();
  });
});

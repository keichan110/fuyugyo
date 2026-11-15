import { authStatePath } from '../fixtures/auth-state.ts';
import { expect, test } from '../fixtures/test.ts';

test.use({ storageState: authStatePath('manager') });

test('履歴で戻った直後の旧シフト表の日付通知で画面を引き戻さない', async ({ page }) => {
  // ブラウザが戻った後、旧画面がアンマウントされる前に可視日付通知が届く順序を再現する。
  await page.addInitScript(() => {
    const NativeObserver = window.IntersectionObserver;
    const callbacks = new Map<IntersectionObserver, IntersectionObserverCallback>();
    const targets = new Map<IntersectionObserver, Set<Element>>();
    window.IntersectionObserver = class extends NativeObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(callback, options);
        callbacks.set(this, callback);
        targets.set(this, new Set());
      }
      observe(target: Element) {
        targets.get(this)?.add(target);
        super.observe(target);
      }
      disconnect() {
        callbacks.delete(this);
        targets.delete(this);
        super.disconnect();
      }
    };
    window.addEventListener('popstate', () => {
      if (location.pathname !== '/availabilities') return;
      const target = document.querySelector('[data-agenda-date="2026-01-17"]');
      if (!target) throw new Error('旧シフト表の稼働日が必要です');
      const bounds = target.getBoundingClientRect();
      const entry: IntersectionObserverEntry = {
        target,
        time: performance.now(),
        isIntersecting: true,
        intersectionRatio: 1,
        boundingClientRect: bounds,
        intersectionRect: bounds,
        rootBounds: null,
      };
      for (const [observer, callback] of callbacks) {
        if (targets.get(observer)?.has(target)) {
          document.documentElement.dataset.lateAgendaNotification = 'delivered';
          callback([entry], observer);
        }
      }
    });
  });

  await page.goto('/availabilities');
  await expect(page.getByRole('heading', { name: 'シフト希望', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'メインナビゲーション' })
    .getByRole('link', { name: 'シフト表', exact: true })
    .click();
  await expect(page.getByText('1/17（土）')).toBeVisible();
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('data-late-agenda-notification', 'delivered');
  await expect(page).toHaveURL(/\/availabilities/);
  await expect(page.getByRole('heading', { name: 'シフト希望', exact: true })).toBeVisible();
});

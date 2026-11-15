import { useRef, useState } from 'react';

import { useWindowEvent } from '@mantine/hooks';

/** iOSの上下端でのバウンドを除き、実際に読める範囲内のスクロール位置を返す。 */
function readScrollPosition(): number {
  const browser: unknown = globalThis;
  if (typeof browser !== 'object' || browser === null) return 0;
  if (!('scrollY' in browser) || typeof browser.scrollY !== 'number') return 0;
  const y = Math.max(0, browser.scrollY);
  if (!('innerHeight' in browser) || typeof browser.innerHeight !== 'number') return y;
  if (!('document' in browser) || typeof browser.document !== 'object' || browser.document === null)
    return y;
  const document = browser.document;
  if (
    !('documentElement' in document) ||
    typeof document.documentElement !== 'object' ||
    document.documentElement === null
  )
    return y;
  const root = document.documentElement;
  if (!('scrollHeight' in root) || typeof root.scrollHeight !== 'number') return y;
  return Math.min(y, Math.max(0, root.scrollHeight - browser.innerHeight));
}

/** 閲覧画面で下へ読み進めたときにタブを隠し、上へ戻すか先頭へ移動すると表示する。 */
export function useMobileNavigationScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  const [initialPosition] = useState(readScrollPosition);
  const previous = useRef(initialPosition);
  const anchor = useRef(initialPosition);
  const direction = useRef(0);

  useWindowEvent(
    'scroll',
    () => {
      if (!enabled) return;
      const y = readScrollPosition();
      const delta = y - previous.current;
      if (y <= 64) {
        previous.current = y;
        anchor.current = y;
        direction.current = 0;
        setHidden(false);
        return;
      }
      if (delta === 0) return;
      const nextDirection = Math.sign(delta);
      // 方向を変えた位置から距離を測り、指の小さな揺れで表示が切り替わるのを防ぐ。
      if (nextDirection !== direction.current) {
        anchor.current = previous.current;
        direction.current = nextDirection;
      }
      previous.current = y;
      const threshold = nextDirection > 0 ? 32 : 24;
      if (Math.abs(y - anchor.current) >= threshold) {
        setHidden(nextDirection > 0);
        anchor.current = y;
      }
    },
    { passive: true },
  );

  return enabled && hidden;
}

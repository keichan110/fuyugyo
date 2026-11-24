import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RootLayout } from '../src/routes/components/RootLayout';

const routerMock = vi.hoisted(() => ({
  navigateProps: undefined as unknown,
  pathname: '/shifts',
  user: null as unknown,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...original,
    Navigate: (props: unknown) => {
      routerMock.navigateProps = props;
      return null;
    },
    useLocation: () => ({ pathname: routerMock.pathname, searchStr: '?date=2026-01' }),
    Outlet: () => createElement('p', null, '子ルート'),
    Link: () => null,
  };
});

vi.mock('../src/features/auth/queries', () => ({
  useMe: () => ({ data: routerMock.user, isLoading: false }),
}));

vi.mock('../src/routes/components/MobileNavigation', () => ({
  MobileNavigation: () => createElement('nav', null, 'モバイルナビ'),
}));
vi.mock('../src/routes/components/NavigationMenu', () => ({
  NavigationMenu: () => createElement('nav', null, 'ナビ'),
}));
vi.mock('../src/routes/components/UserMenu', () => ({
  UserMenu: () => createElement('div', null, 'ユーザーメニュー'),
}));

const member = { id: 'u1', displayName: 'U', pictureUrl: null, role: 'MEMBER', isActive: true };

function render() {
  return renderToString(
    createElement(
      MantineProvider,
      null,
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RootLayout)),
    ),
  );
}

describe('RootLayout', () => {
  beforeEach(() => {
    routerMock.navigateProps = undefined;
    routerMock.pathname = '/shifts';
    routerMock.user = null;
  });

  it('未認証時は現在地のクエリを含めてログインへ遷移する', () => {
    render();

    expect(routerMock.navigateProps).toEqual({
      to: '/login',
      search: { redirect: '/shifts?date=2026-01' },
      replace: true,
    });
  });

  it.each(['/access-request', '/access-request/pending'])(
    '認証済みでも %s はアプリシェルなしで子ルートだけを描画する',
    (pathname) => {
      routerMock.pathname = pathname;
      routerMock.user = member;

      const html = render();

      expect(html).toContain('子ルート');
      expect(html).not.toContain('ナビ');
      expect(html).not.toContain('ユーザーメニュー');
    },
  );

  it('認証済みの通常画面ではアプリシェルを描画する', () => {
    routerMock.user = member;

    const html = render();

    expect(html).toContain('ナビ');
    expect(html).toContain('子ルート');
  });
});

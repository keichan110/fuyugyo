import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { RootLayout } from '../src/routes/components/RootLayout';

const routerMock = vi.hoisted(() => ({
  navigateProps: undefined as unknown,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...original,
    Navigate: (props: unknown) => {
      routerMock.navigateProps = props;
      return null;
    },
    useLocation: () => ({ pathname: '/shifts', searchStr: '?date=2026-01' }),
  };
});

vi.mock('../src/features/auth/queries', () => ({
  useMe: () => ({ data: null, isLoading: false }),
}));

describe('RootLayout', () => {
  it('未認証時は現在地のクエリを含めてログインへ遷移する', () => {
    renderToString(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(RootLayout)),
    );

    expect(routerMock.navigateProps).toEqual({
      to: '/login',
      search: { redirect: '/shifts?date=2026-01' },
      replace: true,
    });
  });
});

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  focusManager,
  MutationObserver,
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logoutMutationOptions, ME_QUERY_KEY, meQueryOptions } from '../src/features/auth/queries';
import { getUnauthenticatedRedirect } from '../src/features/auth/route-policy';
import type { MeResponse } from '../src/features/auth/schema';
import { mySeasonStatsQueryOptions, seasonStatsQueryKey } from '../src/features/shifts/queries';
import { RootLayout } from '../src/routes/components/RootLayout';

const userA: MeResponse = {
  id: 'user-a',
  lineUserId: 'line-user-a',
  displayName: 'User A',
  pictureUrl: null,
  role: 'MEMBER',
  instructorId: 'instructor-a',
  isActive: true,
};

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
});

describe('認証済みクライアントセッション', () => {
  it('window focus 時に本人を再検証して未認証状態へ更新する', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(userA))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient();
    const observer = new QueryObserver(queryClient, meQueryOptions());
    const unsubscribe = observer.subscribe(() => undefined);
    queryClient.mount();

    await vi.waitFor(() => expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(userA));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await vi.waitFor(() => expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
    queryClient.unmount();
  });

  it('logout mutation 成功時に旧 User のキャッシュを破棄して未認証状態にする', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true })));
    const queryClient = new QueryClient();
    queryClient.setQueryData(seasonStatsQueryKey('user-a'), { owner: 'user-a' });
    queryClient.setQueryData(['shift-types'], [{ id: 'shift-type-1' }]);
    const observer = new MutationObserver(queryClient, logoutMutationOptions(queryClient));

    await observer.mutate();

    expect(queryClient.getQueryData(seasonStatsQueryKey('user-a'))).toBeUndefined();
    expect(queryClient.getQueryData(['shift-types'])).toBeUndefined();
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it('認証主体が変わると統計 observer が旧 User の値を表示しない', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(seasonStatsQueryKey('user-a'), { owner: 'user-a' });
    const observer = new QueryObserver(queryClient, mySeasonStatsQueryOptions('user-a'));

    expect(observer.getCurrentResult().data).toEqual({ owner: 'user-a' });
    observer.setOptions(mySeasonStatsQueryOptions('user-b'));

    expect(observer.getCurrentResult().data).toBeUndefined();
  });
});

describe('未認証時のルーティング', () => {
  it('保護画面をログインへ置き換えて元のパスを引き継ぐ', () => {
    expect(getUnauthenticatedRedirect('/shifts/manage')).toEqual({
      to: '/login',
      search: { redirect: '/shifts/manage' },
      replace: true,
    });
  });

  it('保護画面のクエリをログイン後の戻り先に引き継ぐ', () => {
    expect(getUnauthenticatedRedirect('/shifts', '/shifts?date=2026-01')).toEqual({
      to: '/login',
      search: { redirect: '/shifts?date=2026-01' },
      replace: true,
    });
  });

  it('ログイン画面ではリダイレクトしない', () => {
    expect(getUnauthenticatedRedirect('/login')).toBeNull();
  });

  it('未認証になった保護画面の内容を描画しない', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    const rootRoute = createRootRoute({
      component: RootLayout,
    });
    const layoutRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: 'layout',
      component: Outlet,
    });
    const protectedRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/protected',
      component: () => createElement('p', null, '保護画面'),
    });
    const loginRoute = createRoute({
      getParentRoute: () => layoutRoute,
      path: '/login',
      component: () => createElement('p', null, 'ログイン画面'),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([layoutRoute.addChildren([protectedRoute, loginRoute])]),
      history: createMemoryHistory({ initialEntries: ['/protected'] }),
    });
    await router.load();

    const html = renderToString(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(RouterProvider, { router }),
      ),
    );

    expect(html).not.toContain('保護画面');
  });
});

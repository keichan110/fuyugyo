import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAuthenticated, fetchMe, guardLoginPage } from '../src/features/auth/auth-guard';
import {
  getLineAutoLoginUrl,
  getLineLoginUrl,
  getLoginErrorMessage,
  type LoginSearch,
} from '../src/features/auth/login-policy';

const lineUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Line/15.0.0';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 実際のログインルートのガードをメモリルーターで実行する */
async function loadLogin(userAgent: string, path: string, authenticated = false) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      authenticated
        ? Response.json({
            id: 'user',
            lineUserId: 'line-user',
            displayName: 'テスト太郎',
            role: 'MEMBER',
            isActive: true,
            pictureUrl: null,
            instructorId: null,
          })
        : new Response(null, { status: 401 }),
    ),
  );
  const queryClient = new QueryClient();
  const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()();
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    validateSearch: (search: Record<string, unknown>): LoginSearch => ({
      redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
      invite: typeof search.invite === 'string' ? search.invite : undefined,
      error: typeof search.error === 'string' ? search.error : undefined,
    }),
    beforeLoad: ({ context, search }) => guardLoginPage(context.queryClient, search, userAgent),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([loginRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient },
    isServer: true,
  });
  await router.load();
  queryClient.clear();
  return router;
}

describe('ログインルートの認証ガード', () => {
  it('保護ページから OAuth まで元のパスとクエリを保持する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const queryClient = new QueryClient();
    const auth = await ensureAuthenticated(queryClient, '/shifts?date=2026-01');
    expect(auth.authenticated).toBe(false);
    if (auth.authenticated) throw new Error('未認証の遷移先が必要');
    const router = await loadLogin(lineUserAgent, auth.loginTo);
    expect(router.state.redirect?.options.href).toBe(
      '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01',
    );
    queryClient.clear();
  });
  it('LINE 内の未認証ユーザーはログイン画面を描画せず OAuth へリダイレクトする', async () => {
    const router = await loadLogin(lineUserAgent, '/login?redirect=%2Fshifts&invite=token');
    expect(router.state.redirect?.options).toMatchObject({
      href: '/api/auth/line/login?redirect=%2Fshifts&invite=token',
      reloadDocument: true,
      replace: true,
    });
  });

  it.each([
    [lineUserAgent, '/login?error=auth_failed'],
    ['Mozilla/5.0 Chrome/130.0', '/login?redirect=%2Fshifts'],
  ])('エラー表示時と外部ブラウザはログイン画面に留まる', async (userAgent, path) => {
    const router = await loadLogin(userAgent, path);
    expect(router.state.redirect).toBeUndefined();
    expect(router.state.matches.at(-1)?.status).toBe('success');
  });

  it('認証済みなら LINE 内でも OAuth を開始せず元のパスへ戻る', async () => {
    const router = await loadLogin(lineUserAgent, '/login?redirect=%2Fshifts', true);
    expect(router.state.redirect?.options).toMatchObject({ to: '/shifts' });
    expect(router.state.redirect?.options.reloadDocument).not.toBe(true);
  });

  it('OAuth 後も認証できなければ再び自動ログインせず、招待と戻り先を保持して手動再試行へ切り替える', async () => {
    const initial = await loadLogin(
      lineUserAgent,
      '/login?redirect=%2Fshifts%3Fdate%3D2026-01&invite=token',
    );
    expect(initial.state.redirect?.options.reloadDocument).toBe(true);

    const returned = await loadLogin(lineUserAgent, '/login?redirect=%2Fshifts%3Fdate%3D2026-01');
    expect(returned.state.redirect?.options).toMatchObject({
      to: '/login',
      search: { redirect: '/shifts?date=2026-01', invite: 'token', error: 'auto_login_failed' },
      replace: true,
    });
    expect(returned.state.redirect?.options.reloadDocument).not.toBe(true);
    const stopped = await loadLogin(
      lineUserAgent,
      '/login?error=auto_login_failed&invite=token&redirect=%2Fshifts',
    );
    expect(stopped.state.redirect).toBeUndefined();
    expect(getLineLoginUrl({ invite: 'token', redirect: '/shifts?date=2026-01' })).toBe(
      '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01&invite=token',
    );
  });

  it('保護ページで本人確認が成功したら、次のセッション切れでは再び自動ログインできる', async () => {
    await loadLogin(lineUserAgent, '/login');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          id: 'user',
          lineUserId: 'line-user',
          displayName: 'テスト太郎',
          role: 'MEMBER',
          isActive: true,
          pictureUrl: null,
          instructorId: null,
        }),
      ),
    );
    const queryClient = new QueryClient();
    expect(await fetchMe(queryClient)).not.toBeNull();
    queryClient.clear();

    const nextSession = await loadLogin(lineUserAgent, '/login');
    expect(nextSession.state.redirect?.options.href).toBe('/api/auth/line/login?redirect=%2F');
  });

  it('タブ内ストレージがない環境では自動遷移せず手動ログインへ切り替える', async () => {
    vi.stubGlobal('sessionStorage', undefined);
    const router = await loadLogin(lineUserAgent, '/login?invite=token');
    expect(router.state.redirect?.options).toMatchObject({
      to: '/login',
      search: { invite: 'token', error: 'auto_login_unavailable' },
    });
    expect(router.state.redirect?.options.reloadDocument).not.toBe(true);
  });

  it('ストレージへの書き込みが拒否された場合も自動遷移しない', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('保存不可');
      },
      removeItem: () => undefined,
    });
    const router = await loadLogin(lineUserAgent, '/login');
    expect(router.state.redirect?.options).toMatchObject({
      to: '/login',
      search: { error: 'auto_login_unavailable' },
    });
  });

  it('保存内容が破損していても自動ログインを繰り返さず、手動ログインは利用できる', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => 'invalid-json',
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    const router = await loadLogin(lineUserAgent, '/login?invite=token');
    expect(router.state.redirect?.options).toMatchObject({
      to: '/login',
      search: { invite: 'token', error: 'auto_login_failed' },
    });
    const manual = await loadLogin(lineUserAgent, '/login?error=auto_login_failed&invite=token');
    expect(manual.state.redirect).toBeUndefined();
  });

  it('ストレージの削除が拒否されても本人確認は成功する', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => '{}',
      setItem: () => undefined,
      removeItem: () => {
        throw new Error('削除不可');
      },
    });
    const router = await loadLogin(lineUserAgent, '/login?redirect=%2Fshifts', true);
    expect(router.state.redirect?.options).toMatchObject({ to: '/shifts' });
  });

  it('認証が確認できない間に別の招待を開いた場合は、新しい招待を優先して手動再試行できる', async () => {
    await loadLogin(lineUserAgent, '/login?invite=old-token');
    const router = await loadLogin(lineUserAgent, '/login?invite=new-token');
    expect(router.state.redirect?.options).toMatchObject({
      to: '/login',
      search: { invite: 'new-token', error: 'auto_login_failed' },
    });
  });
});

describe('ログイン失敗時の案内', () => {
  it('自動ログイン後の認証確認失敗ではCookie設定と手動再試行を案内する', () => {
    expect(getLoginErrorMessage('auto_login_failed')).toContain('Cookie設定');
  });

  it.each(['session_expired', 'invalid_session', 'invalid_state'])(
    'セッションを復元できない場合（%s）は招待リンクの開き直しを案内する',
    (error) => {
      expect(getLoginErrorMessage(error)).toContain('招待リンクを開き直してください');
    },
  );
});

describe('LINE 内ブラウザの自動ログイン', () => {
  it('LINE 内ブラウザと LIFF は元のパスとクエリを保持して OAuth へ進む', () => {
    expect(getLineAutoLoginUrl(lineUserAgent, { redirect: '/shifts?date=2026-01' })).toBe(
      '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01',
    );
  });

  it('招待トークンを OAuth 開始 URL に保持する', () => {
    expect(
      getLineAutoLoginUrl(lineUserAgent, { invite: 'invite-token', redirect: '/shifts' }),
    ).toBe('/api/auth/line/login?redirect=%2Fshifts&invite=invite-token');
  });

  it('戻り先の指定がなければホームへ戻る', () => {
    expect(getLineAutoLoginUrl(lineUserAgent, {})).toBe('/api/auth/line/login?redirect=%2F');
  });

  it.each(['auth_failed', 'inactive_user', 'invalid_invitation', ''])(
    'エラー（%s）があれば自動ログインを止める',
    (error) => {
      expect(getLineAutoLoginUrl(lineUserAgent, { error, invite: 'invite-token' })).toBeNull();
    },
  );

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1',
    '',
  ])('PC・外部ブラウザ（%s）は自動ログインしない', (userAgent) => {
    expect(getLineAutoLoginUrl(userAgent, { invite: 'invite-token' })).toBeNull();
  });

  it('手動で再試行する場合も招待と戻り先を引き継ぐ', () => {
    expect(getLineLoginUrl({ invite: 'token+with/slash', redirect: '/shifts?date=2026-01' })).toBe(
      '/api/auth/line/login?redirect=%2Fshifts%3Fdate%3D2026-01&invite=token%2Bwith%2Fslash',
    );
  });
});

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';

import { LoginPage } from '../src/features/auth/components/LoginPage';
import { getLoginErrorMessage } from '../src/features/auth/login-policy';

/** ログイン画面を描画し、利用者に表示される案内と操作を検証する */
function renderLoginPage(error?: string) {
  return renderToString(
    createElement(MantineProvider, null, createElement(LoginPage, { error })),
  );
}

describe('ログイン画面の再試行', () => {
  it.each(['invitation_required', 'invitation_invalid', 'inactive_user'])(
    '再試行では解消しないエラー（%s）は案内のみ表示する',
    (error) => {
      const html = renderLoginPage(error);
      expect(html).toContain(getLoginErrorMessage(error));
      expect(html).not.toContain('LINEでログイン');
      expect(html).not.toContain('<button');
    },
  );

  it.each([
    undefined,
    '',
    'auth_failed',
    'session_expired',
    'invalid_session',
    'invalid_state',
    'token_exchange_failed',
    'profile_fetch_failed',
    'user_creation_failed',
    'auto_login_failed',
    'auto_login_unavailable',
    'rate_limited',
    'unknown_error',
  ])('通常時や再試行可能なエラー（%s）はログインボタンを表示する', (error) => {
    const html = renderLoginPage(error);
    expect(html).toContain('LINEでログイン');
    if (error) {
      expect(html).toContain(getLoginErrorMessage(error));
    }
  });
});

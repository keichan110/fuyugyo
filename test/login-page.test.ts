import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';

import { LoginPage } from '../src/features/auth/components/LoginPage';

/** ログイン画面を描画する */
function renderLoginPage(error?: string) {
  return renderToString(
    createElement(
      MantineProvider,
      null,
      createElement(LoginPage, { error, onLineLogin: () => undefined }),
    ),
  );
}

describe('ログイン画面の再試行', () => {
  it.each(['inactive_user'])(
    '再試行では解消しないエラー（%s）はログインボタンを表示しない',
    (error) => {
      const html = renderLoginPage(error);
      expect(html).not.toContain('LINEでログイン');
      expect(html).not.toContain('<button');
    },
  );

  it.each([
    undefined,
    '',
    'invitation_required',
    'invitation_invalid',
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
  });
});

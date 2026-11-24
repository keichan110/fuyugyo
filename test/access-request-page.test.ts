import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';

import { AccessRequestPage } from '../src/features/access-requests/components/AccessRequestPage';
import { AccessRequestPendingPage } from '../src/features/access-requests/components/AccessRequestPendingPage';

/** 申請画面を描画する */
function renderRequestPage(failedStatus: number | null) {
  return renderToString(
    createElement(
      MantineProvider,
      null,
      createElement(AccessRequestPage, {
        failedStatus,
        isSubmitting: false,
        onSubmit: () => undefined,
        onLogin: () => undefined,
      }),
    ),
  );
}

const SUBMIT_LABEL = '>利用許可を申請する</span>';
const LOGIN_LABEL = 'ログイン画面へ';

describe('利用許可の申請画面', () => {
  it('初期表示は説明文と「利用許可を申請する」ボタンを出し、エラーは出さない', () => {
    const html = renderRequestPage(null);
    expect(html).toContain(
      'このLINEアカウントには利用許可がありません。利用許可を申請すると、管理者に承認された後に利用できるようになります。',
    );
    expect(html).toContain(SUBMIT_LABEL);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(LOGIN_LABEL);
  });

  it('403 は受付停止の案内を出し、申請ボタンを隠す', () => {
    const html = renderRequestPage(403);
    expect(html).toContain('現在、利用許可の申請を受け付けていません。管理者に連絡してください。');
    expect(html).not.toContain(SUBMIT_LABEL);
    expect(html).not.toContain(LOGIN_LABEL);
  });

  it('401 は有効期限切れを案内し、申請ボタンの代わりにログイン画面へ誘導する', () => {
    const html = renderRequestPage(401);
    expect(html).toContain('申請の有効期限が切れました。もう一度ログインしてください。');
    expect(html).not.toContain(SUBMIT_LABEL);
    expect(html).toContain(LOGIN_LABEL);
  });

  it('409 は登録済みを案内し、申請ボタンの代わりにログイン画面へ誘導する', () => {
    const html = renderRequestPage(409);
    expect(html).toContain('このLINEアカウントは登録済みです。もう一度ログインしてください。');
    expect(html).not.toContain(SUBMIT_LABEL);
    expect(html).toContain(LOGIN_LABEL);
  });

  it.each([429, 500, 0])('%s は再試行を案内し、申請ボタンを残す', (status) => {
    const html = renderRequestPage(status);
    expect(html).toContain('申請に失敗しました。時間をおいてもう一度お試しください。');
    expect(html).toContain(SUBMIT_LABEL);
    expect(html).not.toContain(LOGIN_LABEL);
  });
});

describe('承認待ち画面', () => {
  it('受付済みと承認後に利用できることを案内し、操作ボタンは出さない', () => {
    const html = renderToString(
      createElement(MantineProvider, null, createElement(AccessRequestPendingPage)),
    );
    expect(html).toContain(
      '利用許可の申請を受け付けました。管理者に承認されると、利用できるようになります。',
    );
    expect(html).not.toContain('<button');
  });
});

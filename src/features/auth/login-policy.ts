/** ログインページに渡される戻り先・招待・エラー情報 */
export type LoginSearch = {
  redirect?: string | undefined;
  invite?: string | undefined;
  error?: string | undefined;
};

/** 戻り先と招待トークンを引き継ぐ LINE OAuth 開始 URL を返す */
export function getLineLoginUrl({ redirect = '/', invite }: LoginSearch): string {
  const params = new URLSearchParams({ redirect });
  if (invite) {
    params.set('invite', invite);
  }
  return `/api/auth/line/login?${params.toString()}`;
}

/** LINE 内でエラー表示がない場合だけ、自動ログイン先を返す */
export function getLineAutoLoginUrl(userAgent: string, search: LoginSearch): string | null {
  if (!userAgent.includes('Line/') || search.error !== undefined) {
    return null;
  }
  return getLineLoginUrl(search);
}

/** ログイン失敗の理由に応じて、手動再試行や招待リンクの開き直しを案内する */
export function getLoginErrorMessage(error: string): string {
  if (error === 'auto_login_failed') {
    return 'ログイン状態を確認できませんでした。ブラウザのCookie設定を確認して、もう一度ログインしてください。';
  }
  if (error === 'auto_login_unavailable') {
    return '自動ログインを開始できませんでした。下のボタンからログインしてください。';
  }
  if (['session_expired', 'invalid_session', 'invalid_state'].includes(error)) {
    return 'ログインを再開できませんでした。招待リンクから開いた方は、招待リンクを開き直してください。それ以外の方は、もう一度ログインしてください。';
  }
  return 'ログインに失敗しました。もう一度お試しください。';
}

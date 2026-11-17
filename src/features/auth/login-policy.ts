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

/** 再試行しても解消しないため、ログインボタンを表示しないエラー */
const NON_RETRYABLE_LOGIN_ERRORS: readonly string[] = [
  'invitation_required',
  'invitation_invalid',
  'inactive_user',
];

/** エラーなし、または再試行で解消し得るエラーなら true を返す */
export function isRetryableLoginError(error: string | undefined): boolean {
  return error === undefined || !NON_RETRYABLE_LOGIN_ERRORS.includes(error);
}

/** ログイン失敗の理由に応じて、再試行・招待の取得・管理者への連絡を案内する */
export function getLoginErrorMessage(error: string): string {
  if (error === 'invitation_required') {
    return 'このLINEアカウントは登録されていません。管理者から届いた招待リンクを開いてください。';
  }
  if (error === 'invitation_invalid') {
    return 'この招待リンクは利用できません。管理者に招待リンクの再発行を依頼してください。';
  }
  if (error === 'inactive_user') {
    return 'このアカウントは現在利用停止中です。管理者にお問い合わせください。';
  }
  if (error === 'auto_login_failed') {
    return 'ログイン状態を確認できませんでした。ブラウザのCookie設定を確認して、もう一度ログインしてください。';
  }
  if (error === 'auto_login_unavailable') {
    return '自動ログインを開始できませんでした。下のボタンからログインしてください。';
  }
  if (error === 'rate_limited') {
    return 'ログインの試行が多すぎます。1分ほど待ってから、もう一度ログインしてください。';
  }
  if (['session_expired', 'invalid_session', 'invalid_state'].includes(error)) {
    return 'ログインを再開できませんでした。招待リンクから開いた方は、招待リンクを開き直してください。それ以外の方は、もう一度ログインしてください。';
  }
  return 'ログインに失敗しました。もう一度お試しください。';
}

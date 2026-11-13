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

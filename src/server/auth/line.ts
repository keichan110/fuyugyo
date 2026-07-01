/**
 * LINE Login (OAuth 2.1) クライアント。
 * 認証 URL 生成・state 検証・トークン交換・プロフィール取得を提供する。
 * シークレット等は呼び出し側が `c.env` から渡す（モジュールはステートレス）。
 */

/** LINE 認証に必要な設定（`c.env` から組み立てる） */
export type LineConfig = {
  channelId: string;
  channelSecret: string;
  /** コールバック URL（例: `${APP_URL}/api/auth/line/callback`） */
  callbackUrl: string;
};

/** LINE ユーザープロフィール */
export type LineUserProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

/** state に使う文字種 */
const STATE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * CSRF 防止用のランダムな state 文字列を生成する。
 *
 * @param length - 文字列長（デフォルト 32）
 */
export function generateState(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = '';
  for (const byte of bytes) {
    result += STATE_CHARS[byte % STATE_CHARS.length];
  }
  return result;
}

/**
 * LINE 認証画面へのリダイレクト URL を生成する。
 * 招待トークンがある場合は state に `:` 区切りで埋め込み、コールバックで取り出す。
 *
 * @param config - LINE 設定
 * @param state - CSRF 防止用 state
 * @param inviteToken - 招待トークン（招待経由の場合）
 */
export function buildLineAuthUrl(config: LineConfig, state: string, inviteToken?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.channelId,
    redirect_uri: config.callbackUrl,
    state: inviteToken ? `${state}:${inviteToken}` : state,
    scope: 'profile openid',
    ui_locales: 'ja-JP',
  });
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

/** state 検証結果 */
export type StateValidation = {
  isValid: boolean;
  inviteToken?: string;
};

/**
 * コールバックで受信した state を検証し、招待トークンを取り出す。
 *
 * @param receivedState - コールバックの state（`state` または `state:invite`）
 * @param expectedState - Cookie に保存した state
 */
export function validateState(receivedState: string, expectedState: string): StateValidation {
  if (!(receivedState && expectedState)) {
    return { isValid: false };
  }

  if (receivedState.includes(':')) {
    const [state, inviteToken] = receivedState.split(':');
    return inviteToken
      ? { isValid: state === expectedState, inviteToken }
      : { isValid: state === expectedState };
  }

  return { isValid: receivedState === expectedState };
}

/**
 * 認証コードをアクセストークンに交換する。
 *
 * @returns アクセストークン。失敗時は null
 */
export async function exchangeCodeForToken(
  config: LineConfig,
  code: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.channelId,
    client_secret: config.channelSecret,
  });

  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { access_token?: string };
  return data.access_token ?? null;
}

/**
 * アクセストークンで LINE ユーザープロフィールを取得する。
 *
 * @returns プロフィール。失敗時は null
 */
export async function fetchLineUserProfile(accessToken: string): Promise<LineUserProfile | null> {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    userId?: string;
    displayName?: string;
    pictureUrl?: string;
  };

  if (!(data.userId && data.displayName)) {
    return null;
  }

  return data.pictureUrl
    ? {
        userId: data.userId,
        displayName: data.displayName,
        pictureUrl: data.pictureUrl,
      }
    : { userId: data.userId, displayName: data.displayName };
}

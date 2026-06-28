import { lineAuthConfig } from "@/lib/env";
import { logDebugConfig } from "@/lib/utils/logging";

// LINE認証設定の検証用正規表現
const CHANNEL_ID_REGEX = /^\d+$/;
const CHANNEL_SECRET_REGEX = /^[a-f0-9]{32}$/;

/**
 * LINE OAuth2 認証クライアント
 * LINE Login APIとの連携機能を提供
 */

/**
 * LINE認証の状態管理用の型定義
 */
export type LineAuthState = {
  /** CSRF攻撃防止用のstateパラメータ */
  state: string;
  /** nonce値（必要に応じて） */
  nonce?: string;
  /** 招待トークン（招待経由の場合） */
  inviteToken?: string;
  /** 生成時刻 */
  createdAt: number;
};

/**
 * LINE認証結果の型定義
 */
export type LineAuthResult = {
  success: boolean;
  data?: {
    /** LINE認証コード */
    code: string;
    /** state検証結果 */
    state: string;
  };
  error?: string;
};

/**
 * LINEユーザープロフィールの型定義
 */
export type LineUserProfile = {
  /** LINEユーザーID */
  userId: string;
  /** 表示名 */
  displayName: string;
  /** プロフィール画像URL（オプション） */
  pictureUrl?: string;
  /** ステータスメッセージ（オプション） */
  statusMessage?: string;
};

/**
 * LINEアクセストークン検証結果の型定義
 */
export type LineTokenValidation = {
  success: boolean;
  profile?: LineUserProfile;
  error?: string;
};

/**
 * ランダムなstate値を生成
 * CSRF攻撃防止用の一意な文字列を生成
 *
 * @param length - 生成する文字列の長さ（デフォルト: 32）
 * @returns ランダムなstate文字列
 */
export function generateState(length = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * LINE認証URL生成
 * ユーザーをLINE認証画面にリダイレクトするためのURLを生成
 *
 * @param state - CSRF防止用のstate値
 * @param inviteToken - 招待トークン（オプション）
 * @returns LINE認証URL
 *
 * @example
 * ```typescript
 * const state = generateState();
 * const authUrl = generateLineAuthUrl(state);
 * // ユーザーをauthUrlにリダイレクト
 * ```
 */
export function generateLineAuthUrl(
  state: string,
  inviteToken?: string,
  disableAutoLogin = false
): string {
  const baseUrl = "https://access.line.me/oauth2/v2.1/authorize";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: lineAuthConfig.channelId,
    redirect_uri: lineAuthConfig.callbackUrl,
    state: inviteToken ? `${state}:${inviteToken}` : state,
    scope: "profile openid",
    ui_locales: "ja-JP", // 日本語表示
  });

  // ログアウト後の再認証時は自動ログインを無効化
  // これによりLINEの自動ログイン機能による意図しない再ログインを防ぐ
  if (disableAutoLogin) {
    params.set("disable_auto_login", "true");
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * state値の検証
 * コールバック時に受信したstateが有効かどうかをチェック
 *
 * @param receivedState - コールバックで受信したstate
 * @param expectedState - 期待するstate値
 * @returns 検証結果
 */
export function validateState(
  receivedState: string,
  expectedState: string
): {
  isValid: boolean;
  inviteToken?: string;
} {
  if (!(receivedState && expectedState)) {
    return { isValid: false };
  }

  // 招待トークンが含まれている場合の処理
  if (receivedState.includes(":")) {
    const [state, inviteToken] = receivedState.split(":");
    const result: { isValid: boolean; inviteToken?: string } = {
      isValid: state === expectedState,
    };
    if (inviteToken) {
      result.inviteToken = inviteToken;
    }
    return result;
  }

  return {
    isValid: receivedState === expectedState,
  };
}

/**
 * 認証コードからアクセストークンを取得
 * LINE認証完了後のコールバックでアクセストークンを取得
 *
 * @param code - LINE認証コード
 * @returns アクセストークン取得結果
 */
export async function exchangeCodeForToken(code: string): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  try {
    const tokenUrl = "https://api.line.me/oauth2/v2.1/token";

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: lineAuthConfig.callbackUrl,
      client_id: lineAuthConfig.channelId,
      client_secret: lineAuthConfig.channelSecret,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Token exchange failed: ${response.status} ${errorText}`,
      };
    }

    const data = await response.json();

    if (!data.access_token) {
      return {
        success: false,
        error: "Access token not found in response",
      };
    }

    return {
      success: true,
      accessToken: data.access_token,
    };
  } catch (error) {
    return {
      success: false,
      error: `Token exchange error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * アクセストークンを使用してLINEユーザープロフィール取得
 *
 * @param accessToken - LINEアクセストークン
 * @returns ユーザープロフィール取得結果
 */
export async function getLineUserProfile(
  accessToken: string
): Promise<LineTokenValidation> {
  try {
    const profileUrl = "https://api.line.me/v2/profile";

    const response = await fetch(profileUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Profile fetch failed: ${response.status} ${errorText}`,
      };
    }

    const profileData = await response.json();

    // 必須フィールドの検証
    if (!(profileData.userId && profileData.displayName)) {
      return {
        success: false,
        error: "Invalid profile data: missing required fields",
      };
    }

    const profile: LineUserProfile = {
      userId: profileData.userId,
      displayName: profileData.displayName,
      pictureUrl: profileData.pictureUrl || undefined,
      statusMessage: profileData.statusMessage || undefined,
    };

    return {
      success: true,
      profile,
    };
  } catch (error) {
    return {
      success: false,
      error: `Profile fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * LINE認証フローの完全実行
 * 認証コードからユーザープロフィールまでの一連の処理を実行
 *
 * @param code - LINE認証コード
 * @param receivedState - 受信したstate値
 * @param expectedState - 期待するstate値
 * @returns 認証フロー実行結果
 *
 * @example
 * ```typescript
 * const result = await executeLineAuthFlow(code, receivedState, expectedState);
 * if (result.success && result.profile) {
 *   console.log('User:', result.profile.displayName);
 *   console.log('LINE ID:', result.profile.userId);
 * }
 * ```
 */
export async function executeLineAuthFlow(
  code: string,
  receivedState: string,
  expectedState: string
): Promise<{
  success: boolean;
  profile?: LineUserProfile;
  inviteToken?: string;
  error?: string;
}> {
  // 1. state検証
  const stateValidation = validateState(receivedState, expectedState);
  if (!stateValidation.isValid) {
    return {
      success: false,
      error: "Invalid state parameter - possible CSRF attack",
    };
  }

  // 2. アクセストークン取得
  const tokenResult = await exchangeCodeForToken(code);
  if (!(tokenResult.success && tokenResult.accessToken)) {
    return {
      success: false,
      error: tokenResult.error || "Failed to obtain access token",
    };
  }

  // 3. ユーザープロフィール取得
  const profileResult = await getLineUserProfile(tokenResult.accessToken);
  if (!(profileResult.success && profileResult.profile)) {
    return {
      success: false,
      error: profileResult.error || "Failed to fetch user profile",
    };
  }

  const result: {
    success: boolean;
    profile?: LineUserProfile;
    inviteToken?: string;
    error?: string;
  } = {
    success: true,
    profile: profileResult.profile,
  };

  if (stateValidation.inviteToken) {
    result.inviteToken = stateValidation.inviteToken;
  }

  return result;
}

/**
 * 設定の妥当性チェック
 * LINE認証に必要な環境変数が正しく設定されているかを確認
 *
 * @returns 設定チェック結果
 */
export function validateLineAuthConfig(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!lineAuthConfig.channelId) {
    errors.push("LINE_CHANNEL_ID is not configured");
  }

  if (!lineAuthConfig.channelSecret) {
    errors.push("LINE_CHANNEL_SECRET is not configured");
  }

  if (!lineAuthConfig.callbackUrl) {
    errors.push("Callback URL is not configured");
  }

  // Channel IDの形式チェック（数値のみ）
  if (
    lineAuthConfig.channelId &&
    !CHANNEL_ID_REGEX.test(lineAuthConfig.channelId)
  ) {
    errors.push("LINE_CHANNEL_ID must be numeric");
  }

  // Channel Secretの形式チェック（32文字の16進数）
  if (
    lineAuthConfig.channelSecret &&
    !CHANNEL_SECRET_REGEX.test(lineAuthConfig.channelSecret)
  ) {
    errors.push("LINE_CHANNEL_SECRET must be 32 character hex string");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * デバッグ用：設定情報の表示（Channel Secretは非表示）
 * 開発環境でのトラブルシューティング用
 *
 * @returns マスクされた設定情報
 */
export function getDebugConfig() {
  const config = {
    channelId: lineAuthConfig.channelId,
    channelSecret: lineAuthConfig.channelSecret,
    callbackUrl: lineAuthConfig.callbackUrl,
    configValid: validateLineAuthConfig().isValid,
  };

  logDebugConfig(config);

  return {
    channelId: lineAuthConfig.channelId,
    channelSecret: lineAuthConfig.channelSecret ? "****" : "NOT_SET",
    callbackUrl: lineAuthConfig.callbackUrl,
    configValid: validateLineAuthConfig().isValid,
  };
}

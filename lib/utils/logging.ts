/**
 * セキュアログ出力ユーティリティ
 * 機密情報をマスキングしてログ出力する
 */

// マスキング定数
const MIN_MASK_LENGTH = 8;
const PREFIX_LENGTH = 4;
const SUFFIX_LENGTH = 4;

type SensitiveData = {
  [key: string]: unknown;
};

/**
 * 機密情報をマスクしてログ出力
 */
export function maskSensitiveData(data: SensitiveData): SensitiveData {
  const sensitiveKeys = [
    "token",
    "accesstoken",
    "secret",
    "channelsecret",
    "password",
    "auth",
    "authorization",
    "jwt",
    "code",
    "state",
    "clientsecret",
    "apikey",
  ];

  const masked = { ...data };

  for (const [key, value] of Object.entries(masked)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some((sensitive) =>
      keyLower.includes(sensitive.toLowerCase())
    );

    if (isSensitive && typeof value === "string") {
      if (value.length <= MIN_MASK_LENGTH) {
        masked[key] = "****";
      } else {
        masked[key] =
          `${value.substring(0, PREFIX_LENGTH)}...${value.substring(value.length - SUFFIX_LENGTH)}`;
      }
    }
  }

  return masked;
}

/**
 * セキュアなログ出力関数
 * 機密情報をマスクしてログ出力
 *
 * - error: 本番環境でも出力（Cloudflare Logsに記録）
 * - info/warn/debug: 開発環境でのみ出力
 */
export function secureLog(
  level: "info" | "warn" | "error" | "debug",
  message: string,
  data?: SensitiveData
) {
  // errorレベル以外は開発環境でのみ出力
  if (level !== "error" && process.env.NODE_ENV !== "development") {
    return;
  }

  const maskedData = data ? maskSensitiveData(data) : undefined;

  switch (level) {
    case "info":
      // biome-ignore lint/suspicious/noConsole: ロギングユーティリティの本質的機能
      console.info(`🛡️ ${message}`, maskedData);
      break;
    case "warn":
      // biome-ignore lint/suspicious/noConsole: ロギングユーティリティの本質的機能
      console.warn(`⚠️ ${message}`, maskedData);
      break;
    case "error":
      // biome-ignore lint/suspicious/noConsole: ロギングユーティリティの本質的機能
      console.error(`❌ ${message}`, maskedData);
      break;
    case "debug":
      // biome-ignore lint/suspicious/noConsole: ロギングユーティリティの本質的機能
      console.debug(`🐛 ${message}`, maskedData);
      break;
    default:
      // biome-ignore lint/suspicious/noConsole: ロギングユーティリティの本質的機能
      console.log(`${message}`, maskedData);
      break;
  }
}

/**
 * 認証関連の情報をセキュアにログ出力
 * 機密情報を含む可能性があるデータを安全に記録
 */
export function secureAuthLog(
  message: string,
  data?: {
    hasToken?: boolean;
    hasCode?: boolean;
    hasSecret?: boolean;
    state?: string;
    userId?: string;
    [key: string]: unknown;
  }
) {
  const safeData = data
    ? {
        ...data,
        // state は最初の8文字のみ表示
        state: data.state
          ? `${data.state.substring(0, MIN_MASK_LENGTH)}...`
          : undefined,
      }
    : undefined;

  secureLog("info", `🔐 ${message}`, safeData);
}

/**
 * デバッグ用：設定情報の表示（機密情報は非表示）
 * 開発環境でのトラブルシューティング用
 */
export function logDebugConfig(config: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const maskedConfig = maskSensitiveData(config);
  secureLog("info", "Debug configuration", maskedConfig);
}

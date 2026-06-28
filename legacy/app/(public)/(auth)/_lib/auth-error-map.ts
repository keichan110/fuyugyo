/**
 * 認証エラー情報の型定義
 */
export type AuthErrorInfo = {
  title: string;
  message: string;
  iconName: "alert-triangle" | "x-circle" | "shield";
  canRetry: boolean;
  severity: "error" | "warning";
};

/**
 * エラー種別から表示情報へのマッピング
 *
 * @param error - エラー種別文字列
 * @returns エラー表示情報
 */
export function authErrorMap(error: string): AuthErrorInfo {
  switch (error) {
    case "access_denied":
    case "cancelled":
      return {
        title: "ログインがキャンセルされました",
        message:
          "LINEログインがキャンセルされました。ログインを継続するには、再度お試しください。",
        iconName: "x-circle",
        canRetry: true,
        severity: "warning",
      };

    case "invalid_request":
    case "invalid_callback":
      return {
        title: "認証エラーが発生しました",
        message:
          "認証プロセスでエラーが発生しました。時間をおいて再度お試しください。",
        iconName: "alert-triangle",
        canRetry: true,
        severity: "error",
      };

    case "session_expired":
      return {
        title: "セッションが期限切れです",
        message:
          "ログインセッションが期限切れになりました。再度ログインしてください。",
        iconName: "alert-triangle",
        canRetry: true,
        severity: "warning",
      };

    case "auth_failed":
      return {
        title: "認証に失敗しました",
        message:
          "LINEアカウントでの認証に失敗しました。アカウントの設定をご確認ください。",
        iconName: "shield",
        canRetry: true,
        severity: "error",
      };

    case "inactive_user":
      return {
        title: "アカウントが無効です",
        message:
          "このアカウントは現在無効化されています。管理者にお問い合わせください。",
        iconName: "x-circle",
        canRetry: false,
        severity: "error",
      };

    case "permission_denied":
      return {
        title: "アクセス権限がありません",
        message:
          "このシステムへのアクセス権限がありません。管理者にお問い合わせください。",
        iconName: "shield",
        canRetry: false,
        severity: "error",
      };

    case "system_error":
      return {
        title: "システムエラーが発生しました",
        message:
          "システムで問題が発生しています。しばらく時間をおいて再度お試しください。",
        iconName: "alert-triangle",
        canRetry: true,
        severity: "error",
      };

    case "invitation_required":
      return {
        title: "招待が必要です",
        message:
          "このシステムを利用するには招待が必要です。管理者から招待URLを受け取ってください。",
        iconName: "shield",
        canRetry: false,
        severity: "warning",
      };

    case "invitation_expired":
      return {
        title: "招待の有効期限が切れています",
        message:
          "この招待URLの有効期限が切れています。管理者に新しい招待URLの発行をご依頼ください。",
        iconName: "alert-triangle",
        canRetry: false,
        severity: "warning",
      };

    case "invitation_inactive":
      return {
        title: "招待が無効です",
        message:
          "この招待URLは無効化されています。管理者にお問い合わせください。",
        iconName: "x-circle",
        canRetry: false,
        severity: "warning",
      };

    default:
      return {
        title: "予期しないエラーが発生しました",
        message: "不明なエラーが発生しました。管理者にお問い合わせください。",
        iconName: "alert-triangle",
        canRetry: true,
        severity: "error",
      };
  }
}

/**
 * description文字列をサニタイズ
 * XSS対策として危険な文字を除去
 *
 * @param description - 元の説明文字列
 * @returns サニタイズされた文字列
 */
export function sanitizeDescription(description: string): string {
  if (!description) {
    return "";
  }

  // HTMLタグを除去
  return description
    .replace(/<[^>]*>/g, "")
    .replace(/[<>'"]/g, "")
    .trim();
}

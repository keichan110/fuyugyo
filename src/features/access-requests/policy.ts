/** 申請 API の失敗ステータスに対応する画面の表示内容 */
export type AccessRequestFailure = {
  /** 利用者に見せる案内文 */
  message: string;
  /** 申請ボタンを表示するか（受付停止中は隠す） */
  canSubmit: boolean;
  /** ログイン画面へ戻るボタンを表示するか（申請 Cookie の期限切れ・登録済みの場合） */
  canLogin: boolean;
};

/**
 * 申請 API の失敗ステータスから、画面に出す案内と操作を決める。
 *
 * - 403: 受付停止または上限到達。再試行しても解消しないためボタンを隠す
 * - 401 / 409: もう一度ログインすれば解消するため、申請ではなくログインへ誘導する
 * - その他（429 を含む）: 時間をおいて再試行できる
 *
 * @param status - 失敗した申請 API の HTTP ステータス
 */
export function getAccessRequestFailure(status: number | undefined): AccessRequestFailure {
  if (status === 403) {
    return {
      message: '現在申請を受け付けられません。管理者に連絡してください',
      canSubmit: false,
      canLogin: false,
    };
  }
  if (status === 401) {
    return {
      message: '申請の有効期限が切れました。もう一度ログインしてください。',
      canSubmit: false,
      canLogin: true,
    };
  }
  if (status === 409) {
    return {
      message: 'このLINEアカウントは登録済みです。もう一度ログインしてください。',
      canSubmit: false,
      canLogin: true,
    };
  }
  return {
    message: '申請に失敗しました。時間をおいてもう一度お試しください。',
    canSubmit: true,
    canLogin: false,
  };
}

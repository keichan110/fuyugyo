/** 新規発行する招待リンクの有効期間（秒）。24時間固定 */
export const INVITATION_TTL_SECONDS = 24 * 60 * 60;

/** 同じ ADMIN が発行済みのリンクを再利用する猶予（秒）。発行からちょうど1時間までは再利用する */
export const INVITATION_REUSE_SECONDS = 60 * 60;

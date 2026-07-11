/** アクティブ状態で絞り込む一覧の共通選択肢 */
export const ACTIVE_STATUS_FILTERS = [
  { label: 'すべて', value: 'ALL' },
  { label: 'アクティブ', value: 'ACTIVE' },
  { label: '非アクティブ', value: 'INACTIVE' },
] as const;

export type ActiveStatusFilter = (typeof ACTIVE_STATUS_FILTERS)[number]['value'];

/** 日付ごとの必要人数と配置人数を、重複しない充足状態に分ける。 */
export function monthlyStaffingDistribution(
  days: readonly { required: number | null; assigned: number }[],
) {
  const distribution = [
    { status: 'short', label: '不足', color: 'orange.5', count: 0 },
    { status: 'filled', label: '充足', color: 'gray.6', count: 0 },
    { status: 'over', label: '過員', color: 'yellow.6', count: 0 },
    { status: 'unset', label: '未設定', color: 'gray.3', count: 0 },
    { status: 'notPlanned', label: '開講なし', color: 'gray.1', count: 0 },
  ];
  for (const day of days) {
    const status =
      day.required === null
        ? 'unset'
        : day.assigned < day.required
          ? 'short'
          : day.assigned > day.required
            ? 'over'
            : day.required === 0
              ? 'notPlanned'
              : 'filled';
    const item = distribution.find((entry) => entry.status === status);
    if (item) item.count += 1;
  }
  return distribution;
}

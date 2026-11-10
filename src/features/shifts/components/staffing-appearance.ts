/** 必要人数が正のときの充足率。未設定と開講予定なしは比率を定義しない。 */
export function staffingRate(required: number | null, assigned: number): number | null {
  return required !== null && required > 0 ? (assigned / required) * 100 : null;
}

/** 充足率の乖離に応じたセル背景。必要人数0で配置がある場合も過員として示す。 */
export function staffingBackground(required: number | null, assigned: number): string {
  if (required === null) return 'light-dark(var(--mantine-color-white), var(--mantine-color-body))';
  const rate = staffingRate(required, assigned);
  if (rate === null && assigned === 0)
    return 'light-dark(var(--mantine-color-white), var(--mantine-color-body))';
  if (rate === 100) return 'light-dark(var(--mantine-color-white), var(--mantine-color-body))';
  const shortage = rate !== null && rate < 100;
  const deviation = rate === null ? 100 : Math.min(100, Math.abs(rate - 100));
  const strength = shortage ? Math.round(10 + deviation * 0.4) : Math.round(5 + deviation * 0.2);
  return `color-mix(in srgb, var(--mantine-color-${shortage ? 'orange' : 'yellow'}-5) ${strength}%, light-dark(var(--mantine-color-white), var(--mantine-color-body)))`;
}

import type { Availability } from '../schema';

/** 状態 Select の選択肢（未入力は選べない）。 */
export const AVAILABILITY_SELECT_DATA: { value: Availability['type']; label: string }[] = [
  { value: 'AVAILABLE', label: '勤務可' },
  { value: 'AVOID', label: '要調整' },
  { value: 'UNAVAILABLE', label: '勤務不可' },
];

/** 状態の意味。Select の選択肢内に表示する。 */
export const AVAILABILITY_DESCRIPTIONS = {
  AVAILABLE: '勤務できる日',
  AVOID: '勤務はできるが、できれば避けてほしい日',
  UNAVAILABLE: '勤務できない日',
} satisfies Record<Availability['type'], string>;

/** 文字列が申告状態かを判定する型ガード。 */
export function isAvailabilityType(value: string): value is Availability['type'] {
  return AVAILABILITY_SELECT_DATA.some((option) => option.value === value);
}

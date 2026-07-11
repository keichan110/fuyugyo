import { IconBuilding, IconSkiJumping, IconSnowboarding, type Icon } from '@tabler/icons-react';

import { DEPARTMENT_LABELS, departmentCodeSchema, type DepartmentCode } from './schema';

/** 部門の視覚的アイデンティティ（ラベル・色・アイコン） */
export type DepartmentAppearance = {
  label: string;
  color: string;
  icon: Icon;
};

/**
 * 部門コード → 視覚的アイデンティティの全域マップ（ADR 0011）。
 * 部門を追加すると `DepartmentCode` の型が広がり、このマップの穴埋めを
 * TypeScript がコンパイルエラーで強制する（色・アイコンの付け忘れを防ぐ）。
 */
export const DEPARTMENT_APPEARANCE: Record<DepartmentCode, DepartmentAppearance> = {
  ski: { label: DEPARTMENT_LABELS.ski, color: 'blue', icon: IconSkiJumping },
  snowboard: {
    label: DEPARTMENT_LABELS.snowboard,
    color: 'orange',
    icon: IconSnowboarding,
  },
};

/** 既知のマップに無い部門コードに対するフォールバック外観 */
export const UNKNOWN_DEPARTMENT_APPEARANCE: Pick<DepartmentAppearance, 'color' | 'icon'> = {
  color: 'gray',
  icon: IconBuilding,
};

/**
 * 部門コードから表示用の外観（ラベル・色・アイコン）を解決する。
 * API 外から渡された未知値でも壊れず表示できるようフォールバックする。
 * @param code - 部門コード
 * @param name - 未知コード時のラベルに使う表示名（省略時は `code` をそのまま使う）
 */
export function getDepartmentAppearance(code: string, name?: string): DepartmentAppearance {
  const known = departmentCodeSchema.safeParse(code);
  if (known.success) {
    return DEPARTMENT_APPEARANCE[known.data];
  }
  return { label: name ?? code, ...UNKNOWN_DEPARTMENT_APPEARANCE };
}

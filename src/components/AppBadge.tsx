import { Badge, type BadgeProps } from '@mantine/core';

import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { DepartmentCode } from '@/features/departments/schema';

/** アプリ全体で使うバッジの意味。色と見た目はこのコンポーネントに集約する。 */
export type AppBadgeKind =
  | 'active'
  | 'inactive'
  | 'danger'
  | 'warning'
  | 'pending'
  | 'person'
  | 'personEmphasized'
  | 'certification'
  | 'roleAdmin'
  | 'roleManager'
  | 'roleMember'
  | 'link'
  | 'count'
  | 'highlight';

type AppBadgeProps = Omit<BadgeProps, 'color' | 'variant'> & {
  kind: AppBadgeKind;
  /** 資格バッジが継承する所属部門の色 */
  departmentCode?: DepartmentCode;
};

const BADGE_STYLE_BY_KIND: Record<AppBadgeKind, Pick<BadgeProps, 'color' | 'variant'>> = {
  active: { color: 'green', variant: 'light' },
  inactive: { color: 'gray', variant: 'light' },
  danger: { color: 'red', variant: 'light' },
  warning: { color: 'orange', variant: 'light' },
  pending: { color: 'orange', variant: 'light' },
  person: { color: 'grape', variant: 'light' },
  personEmphasized: { color: 'grape', variant: 'filled' },
  certification: { color: 'indigo', variant: 'light' },
  roleAdmin: { color: 'red', variant: 'light' },
  roleManager: { color: 'blue', variant: 'light' },
  roleMember: { color: 'gray', variant: 'light' },
  link: { color: 'blue', variant: 'light' },
  count: { color: 'teal', variant: 'light' },
  highlight: { color: 'yellow', variant: 'filled' },
};

/**
 * 意味ベースで色を決める共通バッジ。
 * 画面側で Mantine の color / variant を直指定せず、同じ意味の表示を揃える。
 */
export function AppBadge({ kind, departmentCode, ...props }: AppBadgeProps) {
  const style = BADGE_STYLE_BY_KIND[kind];
  const color =
    kind === 'certification' && departmentCode
      ? getDepartmentAppearance(departmentCode).color
      : (style.color ?? 'gray');
  return <Badge {...style} color={color} {...props} />;
}

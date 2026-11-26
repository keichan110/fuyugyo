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
  | 'certification'
  | 'roleAdmin'
  | 'roleManager'
  | 'roleMember'
  | 'link'
  | 'count'
  | 'highlight';

type AppBadgeProps = Omit<BadgeProps, 'color' | 'variant' | 'c'> & {
  kind: AppBadgeKind;
  /** 資格バッジが継承する所属部門の色 */
  departmentCode?: DepartmentCode;
  /** 補助情報のバッジを中立色で控えめに表示する。 */
  muted?: boolean;
};

type BadgeStyle = Pick<BadgeProps, 'color' | 'variant' | 'c'>;

const BADGE_STYLE_BY_KIND: Record<AppBadgeKind, BadgeStyle> = {
  active: { color: 'green', variant: 'light' },
  inactive: { color: 'gray', variant: 'light' },
  danger: { color: 'red', variant: 'light' },
  warning: { color: 'orange', variant: 'light' },
  pending: { color: 'orange', variant: 'light' },
  certification: { color: 'indigo', variant: 'light' },
  roleAdmin: { color: 'red', variant: 'light' },
  roleManager: { color: 'blue', variant: 'light' },
  roleMember: { color: 'gray', variant: 'light' },
  link: { color: 'blue', variant: 'light' },
  count: { color: 'gray', variant: 'light' },
  // Mint の塗りには Deep Teal の文字を組み合わせる
  highlight: { color: 'accent.4', variant: 'filled', c: 'brand.6' },
};

/**
 * 意味ベースで色を決める共通バッジ。
 * 画面側で Mantine の color / variant を直指定せず、同じ意味の表示を揃える。
 */
export function AppBadge({ kind, departmentCode, muted = false, ...props }: AppBadgeProps) {
  const { c, ...style } = BADGE_STYLE_BY_KIND[kind];
  const color = muted
    ? 'gray'
    : kind === 'certification' && departmentCode
      ? getDepartmentAppearance(departmentCode).color
      : (style.color ?? 'gray');
  // 中立色で表示するときは、塗り専用の文字色を引き継がない
  return <Badge {...style} {...(muted ? {} : { c })} color={color} {...props} />;
}

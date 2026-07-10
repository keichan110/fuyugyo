import { Badge, type BadgeProps } from '@mantine/core';

/** アプリ全体で使うバッジの意味。色と見た目はこのコンポーネントに集約する。 */
export type AppBadgeKind =
  | 'active'
  | 'inactive'
  | 'danger'
  | 'warning'
  | 'pending'
  | 'person'
  | 'certification'
  | 'roleAdmin'
  | 'roleManager'
  | 'roleMember'
  | 'link'
  | 'count'
  | 'highlight';

type AppBadgeProps = Omit<BadgeProps, 'color' | 'variant'> & {
  kind: AppBadgeKind;
};

const BADGE_STYLE_BY_KIND: Record<AppBadgeKind, Pick<BadgeProps, 'color' | 'variant'>> = {
  active: { color: 'green', variant: 'light' },
  inactive: { color: 'gray', variant: 'light' },
  danger: { color: 'red', variant: 'light' },
  warning: { color: 'orange', variant: 'light' },
  pending: { color: 'orange', variant: 'light' },
  person: { color: 'cyan', variant: 'light' },
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
export function AppBadge({ kind, ...props }: AppBadgeProps) {
  const style = BADGE_STYLE_BY_KIND[kind];
  return <Badge {...style} {...props} />;
}

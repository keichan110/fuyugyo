import { Badge } from '@mantine/core';

import { getDepartmentAppearance } from './appearance';

/**
 * 部門を色付きアイコン＋ラベルのタグで表示するバッジ。
 * 既知の部門コード（`ski`/`snowboard`）は専用の色・アイコンで表示し、
 * 未知のコードはグレー＋汎用アイコンで `name`（無ければ `code`）を表示する。
 */
export function DepartmentTag({ code, name }: { code: string; name?: string }) {
  const appearance = getDepartmentAppearance(code, name);
  const Icon = appearance.icon;
  return (
    <Badge variant="light" color={appearance.color} leftSection={<Icon size={14} stroke={1.75} />}>
      {appearance.label}
    </Badge>
  );
}

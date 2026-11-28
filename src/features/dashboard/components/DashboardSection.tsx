import { useId, type ReactNode, type RefObject } from 'react';

import { Box, Group, Stack, Title } from '@mantine/core';

type DashboardSectionProps = {
  /** セクションの見出し。領域のアクセシブル名にも使う */
  title: string;
  /** 見出しへプログラムからフォーカスを移す場合の参照 */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** 見出しの直後に添える補足（件数バッジなど） */
  badge?: ReactNode;
  /** 見出し行の右端に置く導線 */
  action?: ReactNode;
  /** セクションの内容。白い面は内容側で用意する */
  children: ReactNode;
};

/** ホームの1セクション。見出しはページの地に置き、その下に内容を並べる。 */
export function DashboardSection({
  title,
  headingRef,
  badge,
  action,
  children,
}: DashboardSectionProps) {
  const headingId = useId();

  return (
    <Box component="section" aria-labelledby={headingId}>
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            <Title
              order={2}
              size="h4"
              id={headingId}
              ref={headingRef}
              tabIndex={headingRef ? -1 : undefined}
            >
              {title}
            </Title>
            {badge}
          </Group>
          {action}
        </Group>
        {children}
      </Stack>
    </Box>
  );
}

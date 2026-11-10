import type { ReactNode } from 'react';

import { Stack, Text, Title } from '@mantine/core';

type Props = {
  title: string;
  /** このブロックが答える問い */
  question: string;
  children: ReactNode;
};

/** 関心ごとごとにパネル群をまとめる見出し付きブロック。 */
export function AnalysisBlock({ title, question, children }: Props) {
  return (
    <Stack gap="sm" component="section">
      <Stack gap={2}>
        <Title order={3}>{title}</Title>
        <Text size="sm" c="dimmed">
          {question}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

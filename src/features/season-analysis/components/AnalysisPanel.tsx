import { useState, type ReactNode } from 'react';

import { ActionIcon, Card, Group, Modal, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconMaximize } from '@tabler/icons-react';

/** 通常表示時のパネル本文の高さ（px）。はみ出す内容はパネル内でスクロールする */
export const PANEL_BODY_HEIGHT = 320;

/** 拡大表示時に、表など自前でスクロールする本文へ与える高さ（モーダルのヘッダー・余白分を引く） */
export const PANEL_EXPANDED_SCROLL_HEIGHT = 'calc(100dvh - 160px)';

/** 通常表示時のチャート高さ（px）。パネル本文に凡例・余白込みで収まる大きさ */
export const PANEL_CHART_HEIGHT = 260;

type Props = {
  title: string;
  /** タイトル下に出す注記文。スクロール領域の外に固定表示する */
  description?: ReactNode;
  /**
   * 本文を縦スクロールさせるか。false なら本文のスクロールを子に任せる
   * （縦横を1つのコンテナで持ち、見出し・氏名を固定したい表向け）。既定は true
   */
  scrollable?: boolean;
  /** `expanded` が true のとき全画面表示。通常時は false */
  children: (expanded: boolean) => ReactNode;
};

/**
 * AWS コンソールのウィジェット風パネル。通常は固定高さのカードで、右上のボタンで全画面に拡大する。
 * 拡大時だけ本文を描画し直すため、各チャートは `expanded` に応じて高さを切り替えられる。
 */
export function AnalysisPanel({ title, description, scrollable = true, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <Card withBorder padding="md" h="100%">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={2}>
              <Text fw={600}>{title}</Text>
              {description && (
                <Text size="xs" c="dimmed" component="div">
                  {description}
                </Text>
              )}
            </Stack>
            <Tooltip label="拡大表示">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={`${title}を拡大表示`}
                onClick={() => setExpanded(true)}
              >
                <IconMaximize size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
          {scrollable ? (
            // 横方向は幅に収める。横スクロールが必要な子は自前で持つ
            <ScrollArea h={PANEL_BODY_HEIGHT} type="auto" scrollbars="y" offsetScrollbars>
              {children(false)}
            </ScrollArea>
          ) : (
            children(false)
          )}
        </Stack>
      </Card>
      <Modal
        fullScreen
        opened={expanded}
        onClose={() => setExpanded(false)}
        title={<Text fw={600}>{title}</Text>}
        closeButtonProps={{ 'aria-label': `${title}の拡大表示を閉じる` }}
      >
        <Stack gap="xs">
          {description && (
            <Text size="xs" c="dimmed" component="div">
              {description}
            </Text>
          )}
          {children(true)}
        </Stack>
      </Modal>
    </>
  );
}

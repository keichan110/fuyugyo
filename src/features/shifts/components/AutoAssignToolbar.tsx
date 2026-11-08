import { Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconWand } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';

type AutoAssignToolbarProps = {
  publicationControls: React.ReactNode;
  autoAssignMode: boolean;
  selectedDateCount: number;
  /** 必要人数の取得前は false（ボタンを無効にする） */
  requirementsReady: boolean;
  /** 必要人数の取得後に、選べる日が1日もない */
  noSelectableDates: boolean;
  /** 自動割当に必要なデータが揃い、開いている種別に必要資格がある */
  canRunAutoAssign: boolean;
  missingCertification: boolean;
  isAutoAssigning: boolean;
  /** 前回の提案がある（実行ボタンを「別の案を出す」にする） */
  hasPreviousProposal: boolean;
  onStartAutoAssign: () => void;
  onCancelAutoAssign: () => void;
  onRunAutoAssign: () => void;
  onOpenBulkModal: () => void;
};

/**
 * カレンダー上部のツールバー。通常時は必要人数の一括設定と自動割当の開始、
 * 自動割当モード中は対象日の案内・キャンセル・実行ボタンと、必要資格なしのエラーを表示する。
 */
export function AutoAssignToolbar({
  publicationControls,
  autoAssignMode,
  selectedDateCount,
  requirementsReady,
  noSelectableDates,
  canRunAutoAssign,
  missingCertification,
  isAutoAssigning,
  hasPreviousProposal,
  onStartAutoAssign,
  onCancelAutoAssign,
  onRunAutoAssign,
  onOpenBulkModal,
}: AutoAssignToolbarProps) {
  return (
    <>
      <Group justify="space-between" mb="sm" wrap="wrap">
        {autoAssignMode ? (
          <>
            <Stack gap={2}>
              <Text size="sm" c="blue" fw={600}>
                自動割当する日を選択（{selectedDateCount}日）
              </Text>
              <Text size="xs" c="dimmed">
                必要人数が設定された日だけ選べます
              </Text>
            </Stack>
            <Group gap="xs">
              <AppButton
                intent="secondary"
                size="xs"
                disabled={isAutoAssigning}
                onClick={onCancelAutoAssign}
              >
                キャンセル
              </AppButton>
              <AppButton
                intent={hasPreviousProposal ? 'secondary' : 'primary'}
                size="xs"
                leftSection={<IconWand size={14} />}
                loading={isAutoAssigning}
                disabled={!canRunAutoAssign || selectedDateCount === 0}
                onClick={onRunAutoAssign}
              >
                {hasPreviousProposal ? '別の案を出す' : '割り当て'}
              </AppButton>
            </Group>
          </>
        ) : (
          <>
            <Group gap="xs">
              <AppButton
                intent="secondary"
                size="xs"
                disabled={!requirementsReady}
                onClick={onOpenBulkModal}
              >
                必要人数を一括設定
              </AppButton>
              {/* disabled のボタンはホバーを受けないため、Tooltip はラッパー要素に付ける */}
              <Tooltip
                label="必要人数が設定された日がありません"
                disabled={!noSelectableDates}
                withArrow
              >
                <Box>
                  <AppButton
                    intent="secondary"
                    size="xs"
                    leftSection={<IconWand size={14} />}
                    disabled={!requirementsReady || noSelectableDates}
                    onClick={onStartAutoAssign}
                  >
                    自動割当
                  </AppButton>
                </Box>
              </Tooltip>
            </Group>
            <Box ml="auto">{publicationControls}</Box>
          </>
        )}
      </Group>

      {autoAssignMode && missingCertification && (
        <Box mb="sm">
          <ErrorAlert>この種別には必要資格が設定されていないため、提案できません。</ErrorAlert>
        </Box>
      )}
    </>
  );
}

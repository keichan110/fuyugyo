import { Group, Modal, NumberInput, Stack, Text } from '@mantine/core';

import { AppButton } from '@/components/AppButton';

import type { useShiftManagerController } from './useShiftManagerController';

type ShiftManagerDialogsProps = {
  controller: ReturnType<typeof useShiftManagerController>;
};

/** 編集破棄の確認と必要人数の一括設定を、ワークスペース共通のダイアログとして表示する。 */
export function ShiftManagerDialogs({ controller }: ShiftManagerDialogsProps) {
  return (
    <>
      <Modal
        opened={controller.pendingNav !== null || controller.blocker.status === 'blocked'}
        onClose={controller.cancelNavigation}
        title="未保存の変更があります"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            未保存の変更が {controller.dirtyCount} 件あります。 このまま
            {controller.pendingNav?.type === 'department'
              ? '部門を切り替える'
              : controller.pendingNav?.type === 'month'
                ? '対象月を変更する'
                : controller.pendingNav?.type === 'shiftType'
                  ? 'シフト種別を切り替える'
                  : '別のページへ移動する'}
            と、これらの変更は破棄されます。
          </Text>
          <Group justify="flex-end" gap="xs">
            <AppButton intent="secondary" onClick={controller.cancelNavigation}>
              キャンセル
            </AppButton>
            <AppButton intent="danger" emphasis="high" onClick={controller.confirmNavigation}>
              破棄して移動
            </AppButton>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={controller.bulkModalOpened}
        onClose={() => controller.setBulkModalOpened(false)}
        title="必要人数を一括設定"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            表示中の部門・シフト種別・月の、必要人数が未設定の日にだけ設定します。設定済みの日は上書きしません。
          </Text>
          <RequiredCountInputs
            weekday={controller.weekdayRequiredCount}
            weekendHoliday={controller.weekendHolidayRequiredCount}
            onWeekdayChange={controller.setWeekdayRequiredCount}
            onWeekendHolidayChange={controller.setWeekendHolidayRequiredCount}
            weekdayLabel="平日の人数"
            weekendHolidayLabel="土日祝の人数"
          />
          <Text size="sm" fw={600}>
            適用対象: {controller.bulkTargetDates.length}日
          </Text>
          <AppButton
            intent="primary"
            onClick={controller.applyBulkRequirementCounts}
            disabled={
              controller.weekdayRequiredCount === '' ||
              controller.weekendHolidayRequiredCount === '' ||
              controller.bulkTargetDates.length === 0
            }
          >
            適用
          </AppButton>
        </Stack>
      </Modal>
    </>
  );
}

type RequiredCountInputsProps = {
  weekday: number | '';
  weekendHoliday: number | '';
  onWeekdayChange: (value: number | '') => void;
  onWeekendHolidayChange: (value: number | '') => void;
  weekdayLabel: string;
  weekendHolidayLabel: string;
};

/** 平日／土日祝の人数入力。空欄は 0 にせず '' のまま保持し、実行側で無効化する。 */
function RequiredCountInputs({
  weekday,
  weekendHoliday,
  onWeekdayChange,
  onWeekendHolidayChange,
  weekdayLabel,
  weekendHolidayLabel,
}: RequiredCountInputsProps) {
  return (
    <Group grow align="flex-start">
      <NumberInput
        label={weekdayLabel}
        allowDecimal={false}
        allowNegative={false}
        min={0}
        value={weekday}
        onChange={(value) => onWeekdayChange(typeof value === 'number' ? value : '')}
      />
      <NumberInput
        label={weekendHolidayLabel}
        allowDecimal={false}
        allowNegative={false}
        min={0}
        value={weekendHoliday}
        onChange={(value) => onWeekendHolidayChange(typeof value === 'number' ? value : '')}
      />
    </Group>
  );
}

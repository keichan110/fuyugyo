import { useState } from 'react';

import { Box, Group, Modal, Stack, Switch, Text } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconWorld } from '@tabler/icons-react';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';

import { usePublishShifts } from '../queries';
import type { PublishShiftsInput, ShiftViewItem } from '../schema';
import {
  formatPublicationDate,
  planPublicationWindow,
  summarizePublicationChanges,
} from './publication-plan';
import type { StagedRequirements } from './requirement-stage';
import type { StagedCell } from './shift-manager-types';
import { cellKey, monthLastDate } from './shift-manager-utils';

type Props = {
  month: string;
  departmentCode: DepartmentCode;
  shiftTypeId: string;
  shiftTypeName: string;
  days: string[];
  date?: string;
  shiftByCell: ReadonlyMap<string, ShiftViewItem>;
  stagedCells: ReadonlyMap<string, StagedCell>;
  stagedRequirements: StagedRequirements;
  disabled: boolean;
};

type MonthDraft = { through: string | null; saved: ReadonlyMap<string, ShiftViewItem> };

/** 月の公開範囲の設定、または選択枠の公開トグルを表示する。 */
export function ShiftPublicationControls(props: Props) {
  return props.date ? (
    <SinglePublicationControl {...props} date={props.date} />
  ) : (
    <MonthlyPublicationControl {...props} />
  );
}

/** 公開ボタンから月の終了日を選び、範囲外の公開取り消しもまとめて確認する。 */
function MonthlyPublicationControl({
  month,
  departmentCode,
  shiftTypeId,
  shiftTypeName,
  days,
  shiftByCell,
  stagedCells,
  stagedRequirements,
  disabled,
}: Props) {
  const [draft, setDraft] = useState<MonthDraft | null>(null);
  const publication = usePublishShifts();
  const input = draft
    ? planPublicationWindow(
        { month, departmentCode, shiftTypeId },
        days,
        draft.through,
        draft.saved,
      )
    : null;
  const changes = input && draft ? summarizePublicationChanges(input, draft.saved) : null;
  const hasUnsaved = days.some(
    (date) =>
      stagedCells.has(cellKey(date, shiftTypeId)) ||
      stagedRequirements.has(cellKey(date, shiftTypeId)),
  );
  const open = () => {
    publication.reset();
    const through =
      days
        .filter((date) => shiftByCell.get(cellKey(date, shiftTypeId))?.status === 'PUBLISHED')
        .at(-1) ?? null;
    setDraft({ through, saved: new Map(shiftByCell) });
  };
  const selectThrough = (through: string | null) =>
    setDraft((current) => (current ? { ...current, through } : current));
  const close = () => {
    if (!publication.isPending) setDraft(null);
  };
  return (
    <>
      <AppButton
        intent="primary"
        size="xs"
        leftSection={<IconWorld size={14} aria-hidden />}
        disabled={disabled}
        onClick={open}
      >
        公開
      </AppButton>
      <Modal.Stack>
        <Modal
          stackId="publication-window"
          opened={draft !== null}
          onClose={close}
          title="シフトの公開範囲"
          centered
          closeOnClickOutside={!publication.isPending}
          closeOnEscape={!publication.isPending}
          withCloseButton={!publication.isPending}
        >
          {draft && input && changes && (
            <Stack gap="md">
              <Text fw={600}>
                {DEPARTMENT_LABELS[departmentCode]} / {shiftTypeName}
              </Text>
              <Text size="sm">
                公開する最終日を選んでください。月初から選択日までを公開し、それより後の日は非公開に戻します。
              </Text>
              <PublicationCalendar
                month={month}
                days={days}
                through={draft.through}
                pending={publication.isPending}
                onChange={selectThrough}
              />
              <PublicationSummary
                publishCount={changes.publishCount}
                unpublishCount={changes.unpublishCount}
                zeroCount={changes.zeroCount}
                shortCount={changes.shortCount}
              />
              {hasUnsaved && (
                <Text size="sm" c="yellow.8">
                  この月・種別に未保存の変更があります。先に保存するか、変更を破棄してください。
                </Text>
              )}
              {publication.isError && <ErrorAlert>{publication.error.message}</ErrorAlert>}
              <Group justify="space-between" gap="xs">
                <UnpublishAllButton
                  input={planPublicationWindow(
                    { month, departmentCode, shiftTypeId },
                    days,
                    null,
                    draft.saved,
                  )}
                  saved={draft.saved}
                  shiftTypeName={shiftTypeName}
                  pending={publication.isPending}
                  error={publication.error?.message}
                  disabled={disabled || hasUnsaved || publication.isPending}
                  onConfirm={(input) =>
                    publication.mutate(input, { onSuccess: () => setDraft(null) })
                  }
                />
                <Group gap="xs" ml="auto">
                  <AppButton
                    intent="secondary"
                    size="xs"
                    disabled={publication.isPending}
                    onClick={close}
                  >
                    キャンセル
                  </AppButton>
                  <AppButton
                    size="xs"
                    intent={
                      changes.publishCount === 0 && changes.unpublishCount > 0
                        ? 'danger'
                        : 'primary'
                    }
                    disabled={
                      disabled || hasUnsaved || changes.publishCount + changes.unpublishCount === 0
                    }
                    loading={publication.isPending}
                    onClick={() => publication.mutate(input, { onSuccess: () => setDraft(null) })}
                  >
                    公開範囲を更新
                  </AppButton>
                </Group>
              </Group>
            </Stack>
          )}
        </Modal>
      </Modal.Stack>
    </>
  );
}

/** 全非公開はアプリ内の確認ダイアログで承認した直後に実行する。 */
function UnpublishAllButton({
  input,
  saved,
  shiftTypeName,
  disabled,
  pending,
  error,
  onConfirm,
}: {
  input: PublishShiftsInput;
  saved: ReadonlyMap<string, ShiftViewItem>;
  shiftTypeName: string;
  disabled: boolean;
  pending: boolean;
  error: string | undefined;
  onConfirm: (input: PublishShiftsInput) => void;
}) {
  const [opened, setOpened] = useState(false);
  const { unpublishCount } = summarizePublicationChanges(input, saved);
  const close = () => {
    if (!pending) setOpened(false);
  };
  return (
    <>
      <AppButton
        intent="danger"
        size="xs"
        disabled={disabled || unpublishCount === 0}
        onClick={() => setOpened(true)}
      >
        全て非公開
      </AppButton>
      <Modal
        stackId="unpublish-all"
        role="alertdialog"
        opened={opened}
        onClose={close}
        title="全て非公開にしますか？"
        centered
        closeOnClickOutside={!pending}
        closeOnEscape={!pending}
        withCloseButton={!pending}
      >
        <Stack gap="md">
          <Text fw={600}>
            {input.month.replace('-', '/')} / {DEPARTMENT_LABELS[input.departmentCode]} /{' '}
            {shiftTypeName}
          </Text>
          <Text size="sm">公開済みの{unpublishCount}枠を全て非公開にします。</Text>
          <Text size="sm">
            メンバーから見えなくなり、編集・自動割当が可能になります。配置と必要人数は保持します。
          </Text>
          {error && <ErrorAlert>{error}</ErrorAlert>}
          <Group justify="flex-end">
            <AppButton intent="secondary" disabled={pending} onClick={close}>
              キャンセル
            </AppButton>
            <AppButton
              intent="danger"
              emphasis="high"
              disabled={disabled}
              loading={pending}
              onClick={() => onConfirm(input)}
            >
              全て非公開にする
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** 公開する最終日を月のカレンダー上で選び、月初からの範囲を示す。 */
function PublicationCalendar({
  month,
  days,
  through,
  pending,
  onChange,
}: {
  month: string;
  days: string[];
  through: string | null;
  pending: boolean;
  onChange: (date: string | null) => void;
}) {
  return (
    <>
      <Box
        component="fieldset"
        disabled={pending}
        bd={0}
        p={0}
        m={0}
        style={{ display: 'flex', justifyContent: 'center' }}
      >
        <DatePicker
          aria-label="公開する最終日"
          value={through}
          onChange={onChange}
          date={`${month}-01`}
          minDate={days[0] ?? `${month}-01`}
          maxDate={days.at(-1) ?? monthLastDate(month)}
          maxLevel="month"
          locale="ja"
          firstDayOfWeek={1}
          hideOutsideDates
          monthLabelFormat="YYYY年M月"
          getDayAriaLabel={(date) =>
            `${formatPublicationDate(date)}${through !== null && date <= through ? ' 公開する期間' : ' 非公開'}`
          }
          getDayProps={(date) => ({
            inRange: through !== null && date <= through,
            firstInRange: date === days[0] && through !== null,
            lastInRange: date === through,
          })}
          mx="auto"
        />
      </Box>
      <Text size="sm" fw={600} aria-live="polite">
        {through
          ? `公開期間：${formatPublicationDate(days[0] ?? `${month}-01`)} 〜 ${formatPublicationDate(through)}`
          : '表示月のすべての枠を非公開にします'}
      </Text>
    </>
  );
}

/** 選択枠の公開状態を一行で示し、切り替えは確認後に反映する。 */
function SinglePublicationControl({
  month,
  departmentCode,
  shiftTypeId,
  shiftTypeName,
  date,
  shiftByCell,
  stagedCells,
  stagedRequirements,
  disabled,
}: Props & { date: string }) {
  const [confirmation, setConfirmation] = useState<PublishShiftsInput | null>(null);
  const publication = usePublishShifts();
  const shift = shiftByCell.get(cellKey(date, shiftTypeId));
  const published = shift?.status === 'PUBLISHED';
  const hasUnsaved =
    stagedCells.has(cellKey(date, shiftTypeId)) ||
    stagedRequirements.has(cellKey(date, shiftTypeId));
  const open = () => {
    publication.reset();
    setConfirmation({
      month,
      departmentCode,
      shiftTypeId,
      status: published ? 'DRAFT' : 'PUBLISHED',
      dates: [
        { date, expectedRevision: shift?.revision ?? null, expectedShiftId: shift?.id ?? null },
      ],
    });
  };
  const close = () => {
    if (!publication.isPending) setConfirmation(null);
  };
  const changes = confirmation ? summarizePublicationChanges(confirmation, shiftByCell) : null;
  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Switch
          label={published ? '公開済み' : '非公開'}
          labelPosition="left"
          checked={published}
          disabled={disabled || hasUnsaved || publication.isPending}
          onChange={open}
          aria-label="この枠をメンバーに公開"
        />
        <Text size="xs" c="dimmed">
          {published ? '確定・編集ロック中' : 'メンバーには非表示'}
        </Text>
      </Group>
      {hasUnsaved && (
        <Text size="xs" c="dimmed">
          公開するには先に保存してください。
        </Text>
      )}
      <Modal
        opened={confirmation !== null}
        onClose={close}
        title={
          confirmation?.status === 'PUBLISHED'
            ? 'この枠を公開しますか？'
            : '公開を取り消して編集しますか？'
        }
        centered
        closeOnClickOutside={!publication.isPending}
        closeOnEscape={!publication.isPending}
        withCloseButton={!publication.isPending}
      >
        {confirmation && changes && (
          <Stack gap="md">
            <Text>
              {formatPublicationDate(date)} / {DEPARTMENT_LABELS[departmentCode]} / {shiftTypeName}
            </Text>
            <PublicationSummary {...changes} />
            {publication.isError && <ErrorAlert>{publication.error.message}</ErrorAlert>}
            <Group justify="flex-end">
              <AppButton intent="secondary" disabled={publication.isPending} onClick={close}>
                キャンセル
              </AppButton>
              <AppButton
                intent={confirmation.status === 'PUBLISHED' ? 'primary' : 'danger'}
                loading={publication.isPending}
                onClick={() =>
                  publication.mutate(confirmation, { onSuccess: () => setConfirmation(null) })
                }
              >
                {confirmation.status === 'PUBLISHED' ? '公開する' : '公開を取り消す'}
              </AppButton>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}

/** 公開と取り消しの影響を実行前に示す。 */
function PublicationSummary({
  publishCount,
  unpublishCount,
  zeroCount,
  shortCount,
}: ReturnType<typeof summarizePublicationChanges>) {
  return (
    <Stack gap="xs" aria-live="polite">
      <Text size="sm">
        新たに公開 {publishCount}枠（配置0名 {zeroCount}枠）・公開取り消し {unpublishCount}枠
      </Text>
      {publishCount > 0 && (
        <Text size="sm">
          公開した枠はメンバーに表示し、配置・必要人数・備考を確定します。配置0名の枠も自動割当から保護します。
        </Text>
      )}
      {unpublishCount > 0 && (
        <Text size="sm" c="yellow.8">
          公開を取り消す枠はメンバーから見えなくなり、編集・自動割当が可能になります。配置と必要人数は保持します。
        </Text>
      )}
      {shortCount > 0 && (
        <Text size="sm" c="yellow.8">
          必要人数に対して不足している枠が{shortCount}枠あります。
        </Text>
      )}
    </Stack>
  );
}

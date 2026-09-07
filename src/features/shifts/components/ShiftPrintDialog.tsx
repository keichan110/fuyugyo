import { useState } from 'react';

import { Group, Input, Modal, SegmentedControl, Stack, Text } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconPrinter } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

import 'dayjs/locale/ja';

import { AppButton } from '@/components/AppButton';
import { DEPARTMENT_LABELS, departmentCodeSchema } from '@/features/departments/schema';

import {
  printableDepartmentSelectionSchema,
  type PrintableDepartmentSelection,
} from '../printable-table';
import { toMonth } from '../view-utils';

/** 印刷対象の部門の選択肢（両部門を先頭に、単一部門を部門コードの並びで並べる） */
const DEPARTMENT_OPTIONS: { value: PrintableDepartmentSelection; label: string }[] = [
  { value: 'both', label: '両部門' },
  ...departmentCodeSchema.options.map((code) => ({
    value: code,
    label: `${DEPARTMENT_LABELS[code]}のみ`,
  })),
];

type ShiftPrintDialogProps = {
  /**
   * 印刷ダイアログを開いた時点の対象月（YYYY-MM）。`null` ならダイアログを閉じる。
   * 開いている間はスクロールや日付の通知で変わらないよう、呼び出し側で固定した値を渡す。
   */
  month: string | null;
  onClose: () => void;
};

/**
 * 印刷する月と部門を選び、印刷用ページを別タブで開くダイアログ。
 * 閲覧画面の絞り込み（部門・自分だけ）は引き継がず、常に全担当者の紙面を出力する。
 * @param month - ダイアログを開いた時点の対象月（YYYY-MM）。`null` で閉じる
 * @param onClose - ダイアログを閉じるときに呼ばれる
 */
export function ShiftPrintDialog({ month, onClose }: ShiftPrintDialogProps) {
  return (
    <Modal opened={month !== null} onClose={onClose} title="シフト表を印刷" centered>
      {/* 開き直すたびにフォームを再マウントし、開いた時点の月を初期値として固定する */}
      {month !== null && <ShiftPrintForm initialMonth={month} onClose={onClose} />}
    </Modal>
  );
}

type ShiftPrintFormProps = {
  /** 開いた時点の対象月（YYYY-MM） */
  initialMonth: string;
  onClose: () => void;
};

/** 印刷条件（月・部門）の入力フォーム。ダイアログの開閉ごとに再マウントされる前提で状態を持つ。 */
function ShiftPrintForm({ initialMonth, onClose }: ShiftPrintFormProps) {
  const [month, setMonth] = useState(initialMonth);
  const [departments, setDepartments] = useState<PrintableDepartmentSelection>('both');

  return (
    <Stack gap="md">
      <MonthPickerInput
        label="対象月"
        value={`${month}-01`}
        onChange={(value) => {
          if (value) {
            setMonth(toMonth(value));
          }
        }}
        locale="ja"
        valueFormat="YYYY年M月"
        monthsListFormat="M月"
        yearLabelFormat="YYYY年"
        popoverProps={{ withinPortal: true }}
      />

      <div>
        <Input.Label>部門</Input.Label>
        <SegmentedControl
          fullWidth
          data={DEPARTMENT_OPTIONS}
          value={departments}
          onChange={(value) => {
            const parsed = printableDepartmentSelectionSchema.safeParse(value);
            if (parsed.success) {
              setDepartments(parsed.data);
            }
          }}
        />
      </div>

      <Text size="xs" c="dimmed">
        別のタブで印刷用ページを開きます。この画面の絞り込みに関わらず、全担当者を表示します。
      </Text>

      <Group justify="flex-end" gap="sm">
        <AppButton intent="secondary" type="button" onClick={onClose}>
          キャンセル
        </AppButton>
        <AppButton
          intent="primary"
          leftSection={<IconPrinter size={16} />}
          onClick={onClose}
          // Link の型付き検索パラメータを保つため、ルート要素そのものを Link として描画する
          renderRoot={(props) => (
            <Link
              to="/shifts/print"
              search={{ month, departments }}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          )}
        >
          印刷用ページを開く
        </AppButton>
      </Group>
    </Stack>
  );
}

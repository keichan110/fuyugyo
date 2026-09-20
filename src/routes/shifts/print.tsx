import { useMemo } from 'react';

import { Container, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';

import { ErrorAlert } from '@/components/AppAlert';
import { PrintableShiftTable } from '@/features/shifts/components/PrintableShiftTable';
import {
  buildPrintableShiftTable,
  printableDepartmentSelectionSchema,
} from '@/features/shifts/printable-table';
import { useShiftCalendar } from '@/features/shifts/queries';
import { monthStringSchema } from '@/features/shifts/schema';

/**
 * 印刷条件の検索パラメータ。
 * 別タブで開いた印刷用ページに、対象月と印刷対象の部門を URL で渡す。
 * 値の妥当性はページ側で検証し、不正な条件では誤った月を表示しない。
 */
type ShiftPrintSearch = {
  /** 対象月（YYYY-MM） */
  month: string;
  /** 印刷対象の部門（both / ski / snowboard） */
  departments: string;
};

export const Route = createFileRoute('/shifts/print')({
  validateSearch: (search: Record<string, unknown>): ShiftPrintSearch => ({
    month: typeof search.month === 'string' ? search.month : '',
    departments: typeof search.departments === 'string' ? search.departments : 'both',
  }),
  component: ShiftPrintPage,
});

function ShiftPrintPage() {
  const search = Route.useSearch();
  const parsedMonth = monthStringSchema.safeParse(search.month);
  const parsedSelection = printableDepartmentSelectionSchema.safeParse(search.departments);
  const month = parsedMonth.success ? parsedMonth.data : null;
  const selection = parsedSelection.success ? parsedSelection.data : null;

  // 印刷対象は月全体とし、閲覧画面の無限スクロールや個人絞り込みは引き継がない
  const calendar = useShiftCalendar(month ?? undefined);
  const shifts = calendar.data?.shifts;

  const table = useMemo(
    () =>
      month && selection && shifts ? buildPrintableShiftTable({ month, selection, shifts }) : null,
    [month, selection, shifts],
  );

  if (!(month && selection)) {
    return (
      <Container size="md" py="md">
        <ErrorAlert title="印刷条件が正しくありません">
          月は YYYY-MM、部門は both・ski・snowboard のいずれかで指定してください。
        </ErrorAlert>
      </Container>
    );
  }

  if (calendar.isError) {
    return (
      <Container size="md" py="md">
        <ErrorAlert title="シフトを取得できませんでした">
          {calendar.error.message}。時間をおいて再読み込みしてください。
        </ErrorAlert>
      </Container>
    );
  }

  if (!table) {
    return (
      <Container size="md" py="md">
        <Text c="dimmed" size="sm">
          読み込み中...
        </Text>
      </Container>
    );
  }

  return <PrintableShiftTable table={table} />;
}

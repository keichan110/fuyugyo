import { SegmentedControl, type SegmentedControlProps } from '@mantine/core';

import { ACTIVE_STATUS_FILTERS, type ActiveStatusFilter } from './status-filter';

type StatusFilterOption = {
  label: string;
  value: ActiveStatusFilter;
};

type StatusFilterControlProps = Omit<
  SegmentedControlProps,
  'data' | 'value' | 'onChange'
> & {
  /** 現在選択されている絞り込み値 */
  value: ActiveStatusFilter;
  /** 絞り込み値を変更したときに呼ばれる */
  onChange: (value: ActiveStatusFilter) => void;
  /** 表示する選択肢。省略時はアクティブ状態の共通選択肢を使う */
  data?: readonly StatusFilterOption[];
};

function isStatusFilterValue<T extends string>(
  value: string,
  data: readonly { value: T }[],
): value is T {
  return data.some((option) => option.value === value);
}

/**
 * 一覧画面で使うステータス絞り込み。
 * Mantine の SegmentedControl をアプリ標準の状態フィルタとして扱えるようにする。
 */
export function StatusFilterControl({
  value,
  onChange,
  data = ACTIVE_STATUS_FILTERS,
  ...props
}: StatusFilterControlProps) {
  return (
    <SegmentedControl
      value={value}
      onChange={(nextValue) => {
        if (isStatusFilterValue(nextValue, data)) {
          onChange(nextValue);
        }
      }}
      data={[...data]}
      {...props}
    />
  );
}

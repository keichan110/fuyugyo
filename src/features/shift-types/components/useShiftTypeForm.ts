import { useForm } from '@mantine/form';

/** ShiftTypeForm が扱う入力値 */
export type ShiftTypeFormValues = {
  name: string;
};

const EMPTY_VALUES: ShiftTypeFormValues = {
  name: '',
};

/**
 * シフト種別名を扱う useForm インスタンスを生成する。
 * 送信は呼び出し側が制御するため、この hook はバリデーション付きの状態のみを提供する。
 * @param initialValues - 編集時の初期値（未指定時は空フォーム＝作成モード）
 */
export function useShiftTypeForm(initialValues?: ShiftTypeFormValues) {
  return useForm<ShiftTypeFormValues>({
    initialValues: initialValues ?? EMPTY_VALUES,
    validate: {
      name: (value) => {
        if (value.trim().length === 0) return '種別名を入力してください';
        if (value.length > 100) return '種別名は100文字以内で入力してください';
        return null;
      },
    },
  });
}

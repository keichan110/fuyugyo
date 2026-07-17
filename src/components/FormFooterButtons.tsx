import { Group } from '@mantine/core';

import { AppButton } from './AppButton';

type FormFooterButtonsProps = {
  saving: boolean;
  onCancel: () => void;
};

/**
 * Drawer 内フォーム末尾のキャンセル・保存ボタン。
 * 配置、キャンセルの variant、保存中の disabled/loading を共通化する。
 */
export function FormFooterButtons({ saving, onCancel }: FormFooterButtonsProps) {
  return (
    <Group justify="flex-end">
      <AppButton intent="secondary" type="button" onClick={onCancel} disabled={saving}>
        キャンセル
      </AppButton>
      <AppButton intent="primary" type="submit" loading={saving}>
        保存
      </AppButton>
    </Group>
  );
}

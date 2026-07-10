import { Button, Group } from '@mantine/core';

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
      <Button variant="default" type="button" onClick={onCancel} disabled={saving}>
        キャンセル
      </Button>
      <Button type="submit" loading={saving}>
        保存
      </Button>
    </Group>
  );
}

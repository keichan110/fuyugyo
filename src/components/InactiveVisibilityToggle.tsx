import { Button, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

type InactiveVisibilityToggleProps = {
  /** 無効な項目を表示しているかどうか。 */
  shown: boolean;
  onChange: (shown: boolean) => void;
};

/** 一覧内の無効な項目を表示・非表示に切り替える操作。 */
export function InactiveVisibilityToggle({ shown, onChange }: InactiveVisibilityToggleProps) {
  const label = shown ? '無効な項目を隠す' : '無効な項目を表示';

  return (
    <Tooltip label={label}>
      <Button
        aria-label={label}
        size="sm"
        variant={shown ? 'light' : 'default'}
        leftSection={shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        onClick={() => onChange(!shown)}
      >
        無効
      </Button>
    </Tooltip>
  );
}

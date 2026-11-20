import { Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';

import { AppButton } from './AppButton';

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
      <AppButton
        intent="toggle"
        active={shown}
        aria-label={label}
        size="sm"
        leftSection={shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        onClick={() => onChange(!shown)}
      >
        無効
      </AppButton>
    </Tooltip>
  );
}

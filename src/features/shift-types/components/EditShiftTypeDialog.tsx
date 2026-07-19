import { useState } from 'react';

import { Modal } from '@mantine/core';

import { ShiftTypeEditForm } from './ShiftTypeDrawer';

/** シフト種別マスタの編集を登録時と同じモーダルで提供する。 */
export function EditShiftTypeDialog({
  opened,
  shiftTypeId,
  onClose,
}: {
  opened: boolean;
  shiftTypeId: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="シフト種別を編集"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      withCloseButton={!saving}
    >
      {shiftTypeId && (
        <ShiftTypeEditForm
          key={shiftTypeId}
          shiftTypeId={shiftTypeId}
          onClose={onClose}
          onSavingChange={setSaving}
        />
      )}
    </Modal>
  );
}

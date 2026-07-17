import { useState } from 'react';

import { Group, Modal, Select, Stack, Text } from '@mantine/core';

import { WarningAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { useLinkInstructor } from '@/features/auth/queries';
import { useInstructors } from '@/features/instructors/queries';

/**
 * MEMBER 向け画面でインストラクター未連携時に表示する案内。
 * 画面上では案内と導線だけを表示し、連携操作はモーダル内にまとめる。
 */
export function InstructorLinkPrompt() {
  const { data: instructors } = useInstructors();
  const linkInstructor = useLinkInstructor();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [isAlertVisible, setIsAlertVisible] = useState(true);

  const instructorOptions = (instructors ?? []).map((instructor) => ({
    value: instructor.id,
    label: `${instructor.lastName} ${instructor.firstName}`,
  }));

  return (
    <>
      {isAlertVisible && (
        <WarningAlert
          title="インストラクターと連携してください"
          withCloseButton
          closeButtonLabel="連携案内を閉じる"
          onClose={() => setIsAlertVisible(false)}
        >
          <Group justify="space-between" align="center">
            <Text size="sm">連携すると、すべての機能が使えるようになります。</Text>
            <AppButton intent="secondary" type="button" onClick={() => setOpened(true)}>
              連携する
            </AppButton>
          </Group>
        </WarningAlert>
      )}

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="インストラクターと連携"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            あなた自身のインストラクターを選択してください。
          </Text>
          <Group align="flex-end">
            <Select
              label="インストラクター"
              placeholder="インストラクターを選択"
              data={instructorOptions}
              searchable
              value={selectedId}
              onChange={setSelectedId}
              flex={1}
            />
            <AppButton
              intent="primary"
              type="button"
              disabled={!selectedId}
              loading={linkInstructor.isPending}
              onClick={() => {
                if (selectedId) {
                  linkInstructor.mutate({ instructorId: selectedId });
                }
              }}
            >
              連携する
            </AppButton>
          </Group>
          {linkInstructor.isError && (
            <Text c="red" size="sm">
              {linkInstructor.error.message}
            </Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}

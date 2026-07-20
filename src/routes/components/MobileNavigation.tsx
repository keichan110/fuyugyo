import { Burger, Divider, Drawer, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import type { MeResponse } from '@/features/auth/schema';

import { MobileAccountActions } from './MobileAccountActions';
import { NavigationMenu } from './NavigationMenu';

/** モバイル幅でヘッダー導線をまとめるドロワーナビゲーション。 */
export function MobileNavigation({ user }: { user: MeResponse }) {
  const [opened, { close, toggle }] = useDisclosure(false);

  return (
    <>
      <Burger
        hiddenFrom="sm"
        opened={opened}
        onClick={toggle}
        aria-label={opened ? 'ナビゲーションを閉じる' : 'ナビゲーションを開く'}
        size="sm"
      />
      <Drawer opened={opened} onClose={close} title="メニュー">
        <Stack gap="xs">
          <NavigationMenu user={user} onNavigate={close} />
          <Divider my="sm" />
          <MobileAccountActions user={user} />
        </Stack>
      </Drawer>
    </>
  );
}

import { useEffect } from 'react';

import { Box, Center, Stack, Text, Title } from '@mantine/core';

import { AppBadge } from '@/components/AppBadge';
import { clearAutoLoginAttempt } from '@/features/auth/auto-login-attempt';

import classes from './AccessRequestPage.module.css';

/**
 * 承認待ち画面。申請を受け付けたこと、または期限内の申請が既にあることを伝える。通知はしない。
 */
export function AccessRequestPendingPage() {
  // OAuth の往復は完了しているため、残すと次回 /login で auto_login_failed が出る
  useEffect(() => {
    clearAutoLoginAttempt();
  }, []);

  return (
    <Box mih="100dvh" p="md" className={classes.heroBackground}>
      <Center mih="100dvh">
        <Stack align="center" gap="xl" maw={420}>
          <AppBadge kind="highlight" size="lg" radius="xl">
            ❄ PENDING
          </AppBadge>

          <Title order={1} fw={200} ta="center" lts="0.15em">
            Awaiting approval
          </Title>

          <Text size="md" fw={300} c="dimmed" ta="center">
            利用許可の申請を受け付けました。管理者に承認されると、利用できるようになります。
          </Text>
        </Stack>
      </Center>
    </Box>
  );
}

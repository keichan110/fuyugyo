import { Container, Stack } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { ListHeader } from '@/components/ListHeader';
import { AccessRequestList } from '@/features/access-requests/components/AccessRequestList';
import { useAccessRequests } from '@/features/access-requests/queries';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';

export const Route = createFileRoute('/access-requests')({
  beforeLoad: async ({ context, location }) => {
    const result = await ensureAuthenticated(
      context.queryClient,
      location.pathname + location.searchStr,
    );
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
    // ADMIN のみアクセス可（MANAGER 以下は / にリダイレクト）
    if (!hasMinimumRole(result.user.role, 'ADMIN')) {
      throw redirect({ to: '/' });
    }
  },
  component: AccessRequestsPage,
});

function AccessRequestsPage() {
  // ナビの件数バッジと同じクエリを使う
  const { data, isLoading } = useAccessRequests(true);

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <ListHeader
          title="利用申請"
          {...(data === undefined ? {} : { summary: { count: data.length, unit: '件' } })}
          isLoading={isLoading}
        />
        <AccessRequestList />
      </Stack>
    </Container>
  );
}

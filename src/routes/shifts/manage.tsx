import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { ShiftDepartmentEntry } from '@/features/shifts/components/ShiftDepartmentEntry';
import { ShiftManager } from '@/features/shifts/components/ShiftManager';
import { parseShiftManagerSearch } from '@/features/shifts/manager-search';

/**
 * `/shifts/manage` — シフト管理画面。
 *
 * 認証は親レイアウト（`shifts/route.tsx`）で担保済み。ここでは MANAGER 以上の
 * ロールチェックのみを行う。
 */
export const Route = createFileRoute('/shifts/manage')({
  validateSearch: parseShiftManagerSearch,
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'MANAGER')) {
      throw redirect({ to: '/' });
    }
  },
  component: ShiftManagePage,
});

function ShiftManagePage() {
  const { department } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Container size="xl" py="md">
      {department ? (
        <ShiftManager key={department} departmentCode={department} />
      ) : (
        <ShiftDepartmentEntry
          onSelect={(selected) => {
            void navigate({ search: { department: selected } });
          }}
        />
      )}
    </Container>
  );
}

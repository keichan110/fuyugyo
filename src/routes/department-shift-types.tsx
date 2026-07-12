import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { DepartmentShiftTypeList } from '@/features/department-shift-types/components/DepartmentShiftTypeList';

/** `/department-shift-types` — 部門別シフト種別の管理画面。 */
export const Route = createFileRoute('/department-shift-types')({
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'MANAGER')) {
      throw redirect({ to: '/' });
    }
  },
  component: DepartmentShiftTypesPage,
});

function DepartmentShiftTypesPage() {
  return (
    <Container size="lg" py="md">
      <DepartmentShiftTypeList />
    </Container>
  );
}

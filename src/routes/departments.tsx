import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { DepartmentList } from '@/features/departments/components/DepartmentList';

export const Route = createFileRoute('/departments')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/departments');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: DepartmentsPage,
});

function DepartmentsPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <DepartmentList />
    </main>
  );
}

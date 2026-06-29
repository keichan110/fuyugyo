import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { ShiftManager } from '@/features/shifts/components/ShiftManager';

export const Route = createFileRoute('/shifts')({
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/shifts');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: ShiftsPage,
});

function ShiftsPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <ShiftManager />
    </main>
  );
}

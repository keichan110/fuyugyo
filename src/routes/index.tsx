import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthenticated } from '@/features/auth/auth-guard';
import { HealthStatus } from '@/features/health/components/HealthStatus';

export const Route = createFileRoute('/')({
  // 認証必須ルート。未認証はログインページへ弾く（ADR 0003）
  beforeLoad: async ({ context }) => {
    const result = await ensureAuthenticated(context.queryClient, '/');
    if (!result.authenticated) {
      throw redirect({ to: result.loginTo });
    }
  },
  component: IndexPage,
});

function IndexPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <HealthStatus />
    </main>
  );
}

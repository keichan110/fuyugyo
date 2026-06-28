import { createFileRoute } from '@tanstack/react-router';
import { HealthStatus } from '@/features/health/components/HealthStatus';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <HealthStatus />
    </main>
  );
}

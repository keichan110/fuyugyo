import { createFileRoute } from '@tanstack/react-router';

import { AccessRequestPendingPage } from '@/features/access-requests/components/AccessRequestPendingPage';

export const Route = createFileRoute('/access-request/pending')({
  component: AccessRequestPendingPage,
});

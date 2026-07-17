import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/certification-requirements')({
  beforeLoad: () => {
    throw redirect({ to: '/shift-types', replace: true });
  },
});

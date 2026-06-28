import { Outlet, createRootRoute } from '@tanstack/react-router';

/** ルートルート。`routes/` は配線のみで、ページ実体は `features/` に置く（ADR 0002）。 */
export const Route = createRootRoute({
  component: () => <Outlet />,
});

import { Container } from '@mantine/core';
import { useRouterState } from '@tanstack/react-router';

import type { MeResponse } from '@/features/auth/schema';
import { InstructorLinkPrompt } from '@/features/dashboard/components/InstructorLinkPrompt';

const MEMBER_PATHS = new Set(['/shifts', '/availabilities']);

/** ホーム以外の MEMBER 向け画面に、未連携時のインストラクター連携案内を表示する。 */
export function MemberInstructorLinkPrompt({ user }: { user: MeResponse }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (user.instructorId || pathname === '/' || !MEMBER_PATHS.has(pathname)) {
    return null;
  }

  return (
    <Container size="sm" pt="md">
      <InstructorLinkPrompt />
    </Container>
  );
}

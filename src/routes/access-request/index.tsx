import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';

import { AccessRequestPage } from '@/features/access-requests/components/AccessRequestPage';
import { AccessRequestError, useSubmitAccessRequest } from '@/features/access-requests/queries';
import { fetchMe } from '@/features/auth/auth-guard';

export const Route = createFileRoute('/access-request/')({
  // 認証済みの人は申請不要のためトップへ送る
  beforeLoad: async ({ context }) => {
    if (await fetchMe(context.queryClient)) throw redirect({ to: '/' });
  },
  component: AccessRequestRoute,
});

function AccessRequestRoute() {
  const navigate = useNavigate();
  const mutation = useSubmitAccessRequest();
  // AccessRequestError 以外（通信断など）はステータス不明（0）として汎用の失敗表示にする
  const failedStatus = mutation.error
    ? mutation.error instanceof AccessRequestError
      ? mutation.error.status
      : 0
    : null;

  return (
    <AccessRequestPage
      isSubmitting={mutation.isPending}
      failedStatus={failedStatus}
      onSubmit={() =>
        mutation.mutate(undefined, {
          onSuccess: () => void navigate({ to: '/access-request/pending' }),
        })
      }
      onLogin={() => void navigate({ to: '/login' })}
    />
  );
}

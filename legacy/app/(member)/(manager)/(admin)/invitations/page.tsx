import InvitationsContent from "./_components/invitations-content";
import { getInvitations } from "./_lib/data";

/**
 * 招待管理ページ（Server Component）
 * - ADMIN権限が必要（親レイアウトで認証済み）
 * - データはサーバーサイドで取得し、Client Componentに渡す
 */
export default async function InvitationsPage() {
  const invitations = await getInvitations();

  return <InvitationsContent initialData={invitations} />;
}

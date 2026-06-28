import InstructorsContent from "./_components/instructors-content";
import { getInstructors } from "./_lib/data";

/**
 * インストラクター管理ページ（Server Component）
 * - MANAGER以上の権限が必要（親レイアウトで認証済み）
 * - データはサーバーサイドで取得し、Client Componentに渡す
 */
export default async function InstructorsPage() {
  const instructors = await getInstructors();

  return <InstructorsContent initialData={instructors} />;
}

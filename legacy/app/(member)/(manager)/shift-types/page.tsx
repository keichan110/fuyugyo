import ShiftTypesContent from "./_components/shift-types-content";
import { getShiftTypes } from "./_lib/data";

/**
 * シフト種別管理ページ（Server Component）
 * - MANAGER以上の権限が必要（親レイアウトで認証済み）
 * - データはサーバーサイドで取得し、Client Componentに渡す
 */
export default async function ShiftTypesPage() {
  const shiftTypes = await getShiftTypes();

  return <ShiftTypesContent initialShiftTypes={shiftTypes} />;
}

/**
 * インストラクター表示名をフォーマット
 *
 * @param instructor - インストラクター情報
 * @returns フォーマット済み表示名 (例: "山田 太郎")
 */
export function formatInstructorDisplayName(instructor: {
  lastName: string;
  firstName: string;
}): string {
  return `${instructor.lastName} ${instructor.firstName}`;
}

/**
 * インストラクターカナ表示名をフォーマット (null対応)
 *
 * @param instructor - インストラクター情報
 * @returns カナ表示名、nullの場合は漢字名にフォールバック
 */
export function formatInstructorDisplayNameKana(instructor: {
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
}): string {
  if (instructor.lastNameKana && instructor.firstNameKana) {
    return `${instructor.lastNameKana} ${instructor.firstNameKana}`;
  }
  // カナがnullの場合は漢字名にフォールバック
  return formatInstructorDisplayName(instructor);
}

/**
 * 資格情報を要約文字列にフォーマット
 *
 * @description
 * 資格配列を受け取り、カンマ区切りの資格名文字列を返します。
 * 空配列の場合は "なし" を返します。
 *
 * @param certifications - 資格配列（0件以上）
 * @returns カンマ区切りの資格名、または "なし"
 *
 * @example
 * ```typescript
 * formatCertificationSummary([
 *   { certification: { shortName: "SAJ1級" } },
 *   { certification: { shortName: "SAJ2級" } }
 * ]) // => "SAJ1級, SAJ2級"
 *
 * formatCertificationSummary([]) // => "なし"
 * ```
 */
export function formatCertificationSummary(
  certifications: Array<{ certification: { shortName: string } }>
): string {
  if (certifications.length === 0) {
    return "なし";
  }
  return certifications.map((ic) => ic.certification.shortName).join(", ");
}

/**
 * 日付をYYYY-MM-DD形式の文字列にフォーマット
 *
 * ローカルタイムゾーンの日付をそのまま保持します。
 * UTC変換を行わないため、タイムゾーンによる日付のずれが発生しません。
 *
 * @param date - Date オブジェクト
 * @returns YYYY-MM-DD形式の文字列
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

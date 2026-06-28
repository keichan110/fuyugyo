/**
 * ステータスをServer Actionsの入力形式にマッピング
 * UIフォームの小文字ステータスをAPIの大文字形式に変換
 */
export function mapStatusToApi(
  status: "active" | "inactive" | "retired"
): "ACTIVE" | "INACTIVE" | "RETIRED" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "inactive":
      return "INACTIVE";
    case "retired":
      return "RETIRED";
    default:
      return "ACTIVE";
  }
}

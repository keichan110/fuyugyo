import { cn } from "@/lib/utils";
import { DepartmentIcon } from "./department-icon";

type ShiftCardProps = {
  shift: {
    id: string;
    date: Date;
    department: {
      code: string;
      name: string;
    };
    shiftType: {
      name: string;
    };
  };
};

/**
 * 部門コードに応じたスタイルクラスを返すヘルパー関数
 *
 * @description
 * スキー部門とスノーボード部門に対応した背景色・テキスト色・ボーダー色を返します。
 * ライトモード・ダークモードの両方に対応しています。
 *
 * @param departmentCode - 部門コード（大文字・小文字を区別しない）
 * @returns Tailwind CSSクラス名の文字列
 */
function getDepartmentStyles(departmentCode: string) {
  const normalized = departmentCode.toLowerCase();
  switch (normalized) {
    case "ski":
      return "bg-ski-100 text-ski-700 border-ski-300 dark:bg-ski-950/30 dark:text-ski-300 dark:border-ski-700";
    case "snowboard":
      return "bg-snowboard-100 text-snowboard-700 border-snowboard-300 dark:bg-snowboard-950/30 dark:text-snowboard-300 dark:border-snowboard-700";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/**
 * 個別シフト情報を表示するカードコンポーネント
 *
 * @description
 * シフトの日付、部門アイコン、シフトタイプを視覚的に表示するServer Componentです。
 * 主に「今後のシフト」セクション（UpcomingShiftsSection）内のCarouselアイテムとして使用されます。
 * 部門コードに応じた色分けとアイコン表示を提供します。
 *
 * @component
 * @example
 * ```tsx
 * <ShiftCard
 *   shift={{
 *     id: 1,
 *     date: new Date('2024-01-15'),
 *     department: { code: 'ski', name: 'スキー' },
 *     shiftType: { name: '午前' }
 *   }}
 * />
 * ```
 */
export function ShiftCard({ shift }: ShiftCardProps) {
  const date = new Date(shift.date);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];

  const departmentCode = shift.department.code;
  const departmentStyles = getDepartmentStyles(departmentCode);

  return (
    <div className="h-full rounded-lg border p-4">
      <div className="flex h-full flex-col space-y-3">
        <div className="flex items-baseline justify-center gap-1.5 text-center">
          <span className="font-bold text-3xl">
            {month}/{day}
          </span>
          <span className="text-muted-foreground text-xs">({weekday})</span>
        </div>
        <div className="flex flex-col items-center">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium text-xs",
              departmentStyles
            )}
          >
            <DepartmentIcon code={departmentCode} />
            {shift.shiftType.name}
          </span>
        </div>
      </div>
    </div>
  );
}

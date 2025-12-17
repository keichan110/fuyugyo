import { Suspense } from "react";
import { authenticateFromCookies } from "@/lib/auth/middleware";
import { getTodayLocalDate } from "@/lib/utils/date";
import ShiftsContent from "./_components/content";
import {
  getDepartments,
  getMonthlyShifts,
  getWeeklyShifts,
  type MonthlyViewData,
} from "./_lib/data";
import Loading from "./loading";

/**
 * searchParams から文字列値を安全に取得するヘルパー関数
 *
 * @remarks
 * Next.js 15 では searchParams の値が string | string[] | undefined になるため、
 * 配列の場合は最初の要素を取得し、統一的に string | undefined として扱います。
 *
 * @param value - 取得する searchParams の値
 * @returns 正規化された文字列値または undefined
 */
function getSearchParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * シフトページのプロパティ
 */
type ShiftsPageProps = {
  /** URL検索パラメータ（Next.js 15+では Promise 型） */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * シフトページのコンテンツコンポーネント（Server Component）
 *
 * @remarks
 * このコンポーネントは Server Component として実装され、以下の処理を行います：
 *
 * 処理フロー:
 * 1. URL パラメータからビューモード（monthly/weekly）と日付情報を取得
 * 2. サーバーサイドで適切なデータ取得関数を呼び出し
 * 3. 取得したデータを Client Component に渡して表示
 *
 * URL パラメータ:
 * - `view`: "monthly" | "weekly"（デフォルト: "weekly" - Middlewareで設定）
 * - `year`: 年（月間ビュー用、デフォルト: 今年）
 * - `month`: 月（月間ビュー用、デフォルト: 今月）
 * - `dateFrom`: 開始日（週間ビュー用、デフォルト: 今日 - Middlewareで設定）
 *
 * Middleware連携:
 * - `/shifts` にviewパラメータなしでアクセスした場合、Middlewareが自動的に
 *   `?view=weekly&dateFrom=YYYY-MM-DD` にリダイレクト（モバイルファースト設計）
 *
 * データ取得の最適化:
 * - React.cache によるメモ化で同一リクエスト内の重複クエリを防止
 * - Server Component なので初期レンダリングが高速
 *
 * @param props - ページプロパティ
 * @returns シフトページコンテンツ
 */
async function ShiftsPageContent({ searchParams }: ShiftsPageProps) {
  // searchParams は Promise なので await する (Next.js 15+)
  const params = await searchParams;

  // 認証情報を取得して現在のインストラクターIDを取得
  const authResult = await authenticateFromCookies();
  const currentInstructorId =
    authResult.success && authResult.user ? authResult.user.instructorId : null;

  // URLパラメータからビューモードを取得
  const viewParam = getSearchParam(params.view) as
    | "monthly"
    | "weekly"
    | undefined;
  const viewMode = viewParam === "weekly" ? "weekly" : "monthly";

  // 現在の日付を取得（デフォルト値用）
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  // ビューモードに応じたデータ取得
  let shiftsData: MonthlyViewData;
  if (viewMode === "weekly") {
    // 週間ビュー: URLパラメータまたは今日から始まる1週間（タイムゾーン安全）
    const dateFromParam = getSearchParam(params.dateFrom);
    const defaultDateFrom = getTodayLocalDate();
    const dateFrom = dateFromParam ?? defaultDateFrom;
    shiftsData = await getWeeklyShifts(dateFrom);
  } else {
    // 月間ビュー: URLパラメータまたは今月
    const yearParam = getSearchParam(params.year);
    const monthParam = getSearchParam(params.month);
    const year = yearParam ? Number.parseInt(yearParam, 10) : defaultYear;
    const month = monthParam ? Number.parseInt(monthParam, 10) : defaultMonth;
    shiftsData = await getMonthlyShifts(year, month);
  }

  // 各シフトに isMyShift フラグを追加
  const enhancedShifts = shiftsData.shifts.map((shift) => ({
    ...shift,
    isMyShift:
      currentInstructorId !== null &&
      shift.assignedInstructors.some(
        (instructor) => instructor.id === currentInstructorId
      ),
  }));

  // 部門一覧を取得
  const departments = await getDepartments();

  return (
    <ShiftsContent
      initialDepartments={departments}
      initialShifts={enhancedShifts}
    />
  );
}

/**
 * シフト表示ページ（エントリーポイント）
 *
 * @remarks
 * MEMBER以上の権限が必要です（親レイアウトで認証済み）。
 * Suspense でラップすることで、データ取得中に loading.tsx を表示します。
 *
 * ベストプラクティス準拠:
 * - Server Component で直接データ取得
 * - searchParams による URL ベースのビューモード切り替え
 * - Server Actions による書き込み操作
 * - 適切なコンポーネント分割（Server/Client）
 *
 * @param props - ページプロパティ
 * @returns シフト表示ページ
 */
export default function ShiftsPage(props: ShiftsPageProps) {
  return (
    <Suspense fallback={<Loading />}>
      <ShiftsPageContent {...props} />
    </Suspense>
  );
}

import { authenticateFromCookies } from "@/lib/auth/middleware";
import { secureLog } from "@/lib/utils/logging";
import { getDepartments, getMonthlyShifts } from "../_lib/data";
import { generatePDF } from "./_lib/pdf-generator";
import { generatePDFTemplate } from "./_lib/template";

/**
 * バリデーション定数
 */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const MIN_MONTH = 1;
const MAX_MONTH = 12;

/**
 * 月間シフト表のPDFダウンロードエンドポイント
 *
 * @description
 * 指定された年月の月間シフトデータを印刷可能なHTML/PDF形式で返す。
 * 部門ごとに列を分けたカレンダー形式のレイアウト。
 *
 * @route GET /shifts/print?year=YYYY&month=M
 *
 * @example
 * ```
 * GET /shifts/print?year=2025&month=1
 * ```
 *
 * クエリパラメータ:
 * - year (必須): 年 (例: 2025)
 * - month (必須): 月 (1-12)
 *
 * レスポンス:
 * - Content-Type: text/html (MVP) または application/pdf (将来)
 * - Content-Disposition: inline（ブラウザで表示）
 *
 * エラーレスポンス:
 * - 401: 認証エラー
 * - 400: パラメータ不正
 * - 500: サーバーエラー
 */
export async function GET(request: Request) {
  try {
    // 1. 認証チェック
    const authResult = await authenticateFromCookies();
    if (!authResult.success) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. パラメータ取得とバリデーション
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const monthParam = searchParams.get("month");

    if (!(yearParam && monthParam)) {
      return new Response("Missing required parameters: year, month", {
        status: 400,
      });
    }

    const year = Number.parseInt(yearParam, 10);
    const month = Number.parseInt(monthParam, 10);

    // 年の範囲バリデーション
    if (Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) {
      return new Response(
        `Invalid year. Must be between ${MIN_YEAR} and ${MAX_YEAR}`,
        { status: 400 }
      );
    }

    // 月の範囲バリデーション
    if (Number.isNaN(month) || month < MIN_MONTH || month > MAX_MONTH) {
      return new Response("Invalid month. Must be between 1 and 12", {
        status: 400,
      });
    }

    // 3. データ取得（既存関数を再利用）
    const [data, departments] = await Promise.all([
      getMonthlyShifts(year, month),
      getDepartments(),
    ]);

    // 4. HTML生成（部門一覧も渡す）
    const html = generatePDFTemplate(data, departments, year, month);

    // 5. PDF生成（MVP: HTMLをそのまま返す）
    const pdfBuffer = generatePDF(html);

    // 6. レスポンス
    // MVP実装: HTMLとして返す（ブラウザで印刷機能を使用してPDF化）
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline", // ブラウザで表示（attachmentではなくinline）
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });

    // 将来的にはapplication/pdfで返す:
    // return new Response(pdfBuffer, {
    //   headers: {
    //     'Content-Type': 'application/pdf',
    //     'Content-Disposition': `attachment; filename="shift-${year}-${String(month).padStart(2, '0')}.pdf"`,
    //   },
    // });
  } catch (error) {
    secureLog("error", "PDF generation error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Internal Server Error", { status: 500 });
  }
}

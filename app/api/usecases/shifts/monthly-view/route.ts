import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logApiError } from "@/lib/api/error-handlers";
import { withAuth } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";
import { formatDateString } from "../../helpers/formatters";
import {
  departmentMinimalSelect,
  instructorMinimalSelect,
  shiftTypeMinimalSelect,
} from "../../helpers/query-optimizers";
import {
  aggregateByDepartment,
  calculateTotalAssignments,
  formatShiftsData,
} from "../../helpers/shift-aggregators";
import type { CalendarViewResponse } from "../../types/responses";

/**
 * 月次カレンダービュー用のシフト一覧を取得するAPIエンドポイント
 *
 * @description
 * 指定された年月の1ヶ月分のシフトデータを取得します。
 * 各シフトには割り当てられたインストラクター情報、部門情報、シフト種別情報が含まれ、
 * さらに統計情報（シフト数、アサイン数、部門別集計）も同時に返されます。
 *
 * @param request - Next.jsのリクエストオブジェクト
 * @returns 月次シフトデータと統計情報を含むレスポンス
 *
 * @example
 * ```
 * GET /api/usecases/shifts/monthly-view?year=2025&month=1
 * ```
 *
 * クエリパラメータ:
 * - year (必須): 年 (例: 2025)
 * - month (必須): 月 (1-12)
 *
 * レスポンス (成功時 200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "shifts": [...],
 *     "summary": {
 *       "totalShifts": 30,
 *       "totalAssignments": 120,
 *       "dateRange": {
 *         "from": "2025-01-01",
 *         "to": "2025-01-31"
 *       },
 *       "byDepartment": {
 *         "スキー": 20,
 *         "スノーボード": 10
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * レスポンス (エラー時):
 * - 400: パラメータ不正 (year/monthが不正、monthが1-12範囲外)
 * - 401: 認証エラー
 * - 500: サーバーエラー
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<CalendarViewResponse>> {
  // 認証チェック（MEMBERレベル以上）
  const { errorResponse } = await withAuth<CalendarViewResponse>(
    request,
    "MEMBER"
  );
  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { searchParams } = request.nextUrl;
    const yearStr = searchParams.get("year");
    const monthStr = searchParams.get("month");

    // 必須パラメータのチェック
    if (!(yearStr && monthStr)) {
      const STATUS_BAD_REQUEST = 400;
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Required parameters: year, month",
        },
        { status: STATUS_BAD_REQUEST }
      );
    }

    // 数値への変換
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);

    // バリデーション
    if (Number.isNaN(year) || Number.isNaN(month)) {
      const STATUS_BAD_REQUEST = 400;
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Invalid year or month format",
        },
        { status: STATUS_BAD_REQUEST }
      );
    }

    // 年の範囲バリデーション
    const MIN_YEAR = 2000;
    const MAX_YEAR = 2100;
    if (year < MIN_YEAR || year > MAX_YEAR) {
      const STATUS_BAD_REQUEST = 400;
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: `Year must be between ${MIN_YEAR} and ${MAX_YEAR}`,
        },
        { status: STATUS_BAD_REQUEST }
      );
    }

    // 月の範囲バリデーション
    const MIN_MONTH = 1;
    const MAX_MONTH = 12;
    if (month < MIN_MONTH || month > MAX_MONTH) {
      const STATUS_BAD_REQUEST = 400;
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Month must be between 1 and 12",
        },
        { status: STATUS_BAD_REQUEST }
      );
    }

    // 月の開始日と終了日を計算
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // 月末日

    // シフトデータを取得
    const shifts = await (await getPrisma()).shift.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        date: true,
        description: true,
        department: {
          select: departmentMinimalSelect,
        },
        shiftType: {
          select: shiftTypeMinimalSelect,
        },
        shiftAssignments: {
          select: {
            instructor: {
              select: instructorMinimalSelect,
            },
          },
        },
      },
      orderBy: [
        { date: "asc" },
        { departmentId: "asc" },
        { shiftTypeId: "asc" },
      ],
    });

    // データ整形（共通関数を使用）
    const formattedShifts = formatShiftsData(shifts);

    // 部門別集計（共通関数を使用）
    const byDepartment = aggregateByDepartment(formattedShifts);

    // 統計情報の計算（共通関数を使用）
    const totalAssignments = calculateTotalAssignments(formattedShifts);

    return NextResponse.json({
      success: true,
      data: {
        shifts: formattedShifts,
        summary: {
          totalShifts: formattedShifts.length,
          totalAssignments,
          dateRange: {
            from: formatDateString(startDate),
            to: formatDateString(endDate),
          },
          byDepartment,
        },
      },
    });
  } catch (error) {
    logApiError("Failed to fetch monthly view", error);

    const STATUS_INTERNAL_SERVER_ERROR = 500;
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: null,
        error: "Internal server error",
      },
      { status: STATUS_INTERNAL_SERVER_ERROR }
    );
  }
}

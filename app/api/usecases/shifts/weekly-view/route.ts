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
import { validateDateString } from "../../helpers/validators";
import type { CalendarViewResponse } from "../../types/responses";

/**
 * 週次カレンダービュー用のシフト一覧を取得するAPIエンドポイント
 *
 * @description
 * 指定された開始日から1週間分（7日分）のシフトデータを取得します。
 * 各シフトには割り当てられたインストラクター情報、部門情報、シフト種別情報が含まれ、
 * さらに統計情報（シフト数、アサイン数、部門別集計）も同時に返されます。
 *
 * @param request - Next.jsのリクエストオブジェクト
 * @returns 週次シフトデータと統計情報を含むレスポンス
 *
 * @example
 * ```
 * GET /api/usecases/shifts/weekly-view?dateFrom=2025-01-13
 * ```
 *
 * クエリパラメータ:
 * - dateFrom (必須): 週の開始日 (YYYY-MM-DD形式)
 *
 * レスポンス (成功時 200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "shifts": [...],
 *     "summary": {
 *       "totalShifts": 15,
 *       "totalAssignments": 45,
 *       "dateRange": {
 *         "from": "2025-01-13",
 *         "to": "2025-01-19"
 *       },
 *       "byDepartment": {
 *         "スキー": 10,
 *         "スノーボード": 5
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * レスポンス (エラー時):
 * - 400: パラメータ不正 (dateFromが欠落、または不正な日付フォーマット)
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
    const dateFrom = searchParams.get("dateFrom");

    // 必須パラメータのチェック
    if (!dateFrom) {
      const STATUS_BAD_REQUEST = 400;
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Required parameter: dateFrom",
        },
        { status: STATUS_BAD_REQUEST }
      );
    }

    // 日付のバリデーション
    const validation = validateDateString(dateFrom);
    if (!validation.isValid || validation.parsedValue === null) {
      const STATUS_BAD_REQUEST = 400;
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: validation.error || "Invalid date format",
        },
        { status: STATUS_BAD_REQUEST }
      );
    }

    const startDate = validation.parsedValue;

    // 終了日を計算（開始日から6日後 = 7日間）
    const endDate = new Date(startDate);
    const DAYS_IN_WEEK = 7;
    endDate.setDate(endDate.getDate() + DAYS_IN_WEEK - 1);

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
    logApiError("Failed to fetch weekly view", error);

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

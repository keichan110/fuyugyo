import { type NextRequest, NextResponse } from "next/server";
import type { ShiftFormDataResponse } from "@/app/api/usecases/types/responses";
import { logApiError } from "@/lib/api/error-handlers";
import { withAuth } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";

/**
 * シフト作成フォームの初期表示データを取得するAPIエンドポイント
 *
 * @route GET /api/usecases/shifts/form-data
 * @access MEMBER以上
 *
 * @description
 * シフト作成モーダルの初期表示に必要な全データを1回のAPI呼び出しで取得します。
 * 部門一覧、シフト種別一覧、統計情報（アクティブなインストラクター数など）を含みます。
 *
 * @returns {Promise<NextResponse<ShiftFormDataResponse>>} シフトフォームデータ
 *
 * @example
 * // 成功レスポンス (200)
 * {
 *   success: true,
 *   data: {
 *     departments: [
 *       { id: 1, name: "スキー", code: "SKI" }
 *     ],
 *     shiftTypes: [
 *       { id: 1, name: "午前", displayOrder: 1 }
 *     ],
 *     stats: {
 *       activeInstructorsCount: 45,
 *       totalDepartments: 3,
 *       totalShiftTypes: 4
 *     }
 *   }
 * }
 *
 * @example
 * // エラーレスポンス (401)
 * {
 *   success: false,
 *   error: "Authentication required"
 * }
 *
 * @performance
 * - Promise.allで並列クエリ実行により高速化
 * - 必要最小限のフィールドのみselect
 * - Next.js の fetch キャッシュで効率的にキャッシュ可能（推奨: revalidate 300秒）
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ShiftFormDataResponse>> {
  // 認証・認可チェック（MEMBER以上の権限が必要）
  const { errorResponse } = await withAuth<ShiftFormDataResponse>(
    request,
    "MEMBER"
  );
  if (errorResponse) {
    return errorResponse;
  }

  try {
    // 並列でデータ取得してパフォーマンスを最適化
    const [departments, shiftTypes, activeInstructorsCount] = await Promise.all(
      [
        // アクティブな部門のみ取得（名前の昇順）
        (await getPrisma()).department.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
          },
          orderBy: { name: "asc" },
        }),
        // アクティブなシフト種別を取得（名前の昇順）
        (await getPrisma()).shiftType.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            isActive: true,
          },
          orderBy: { name: "asc" },
        }),
        // アクティブなインストラクター数をカウント
        (await getPrisma()).instructor.count({
          where: { status: "ACTIVE" },
        }),
      ]
    );

    // 統計情報を計算してレスポンスを構築
    return NextResponse.json({
      success: true,
      data: {
        departments,
        shiftTypes,
        stats: {
          activeInstructorsCount,
          totalDepartments: departments.length,
          totalShiftTypes: shiftTypes.length,
        },
      },
    });
  } catch (error) {
    logApiError("Failed to fetch shift form data", error);

    const STATUS_INTERNAL_SERVER_ERROR = 500;
    return NextResponse.json(
      {
        success: false,
        data: null,
        message: null,
        error: "Internal server error",
      } satisfies ShiftFormDataResponse,
      { status: STATUS_INTERNAL_SERVER_ERROR }
    );
  }
}

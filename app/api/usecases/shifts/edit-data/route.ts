import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logApiError } from "@/lib/api/error-handlers";
import { withAuth } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";
import { secureLog } from "@/lib/utils/logging";
import {
  formatCertificationSummary,
  formatInstructorDisplayName,
  formatInstructorDisplayNameKana,
} from "../../helpers/formatters";
import { instructorWithCertificationsSelect } from "../../helpers/query-optimizers";
import {
  validateDateString,
  validateRequiredParams,
  validateStringId,
} from "../../helpers/validators";
import type { ShiftEditDataResponse } from "../../types/responses";

/**
 * シフト編集データ取得エンドポイント
 *
 * @description
 * シフト編集モーダルで必要な全データを1回のAPI呼び出しで取得します。
 * - 既存シフトの検索と編集/作成モードの判定
 * - 部門別の利用可能なインストラクター一覧（資格フィルタ付き）
 * - 同日の他シフトとの競合チェック
 * - フォーム初期値の生成
 *
 * @route GET /api/usecases/shifts/edit-data
 * @access MANAGER権限必須
 *
 * @param request - Next.jsリクエストオブジェクト
 * @param request.nextUrl.searchParams.date - 日付（YYYY-MM-DD形式）
 * @param request.nextUrl.searchParams.departmentId - 部門ID
 * @param request.nextUrl.searchParams.shiftTypeId - シフト種別ID
 *
 * @returns {Promise<NextResponse<ShiftEditDataResponse>>} シフト編集データ
 * @returns {ShiftEditDataResponse.data.mode} - "edit"（既存シフト編集）または"create"（新規作成）
 * @returns {ShiftEditDataResponse.data.shift} - 既存シフト情報（作成モードの場合はnull）
 * @returns {ShiftEditDataResponse.data.availableInstructors} - インストラクター一覧（アサイン状態・競合情報付き）
 * @returns {ShiftEditDataResponse.data.conflicts} - 競合情報の詳細
 * @returns {ShiftEditDataResponse.data.formData} - フォーム初期値
 *
 * @throws {400} - パラメータが不正な場合
 * @throws {401} - 認証エラー
 * @throws {403} - MANAGER権限がない場合
 * @throws {500} - サーバーエラー
 *
 * @example
 * ```typescript
 * // 既存シフトの編集データ取得
 * const response = await fetch(
 *   '/api/usecases/shifts/edit-data?date=2025-01-15&departmentId=1&shiftTypeId=1'
 * );
 * const data = await response.json();
 *
 * if (data.success && data.data.mode === 'edit') {
 *   console.log('既存シフトID:', data.data.shift.id);
 *   console.log('アサイン済み:', data.data.shift.assignedInstructorIds);
 * }
 * ```
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ShiftEditDataResponse>> {
  // 認証チェック（MANAGER権限必須）
  const { errorResponse } = await withAuth<ShiftEditDataResponse>(
    request,
    "MANAGER"
  );

  if (errorResponse) {
    return errorResponse;
  }

  try {
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date");
    const departmentId = searchParams.get("departmentId");
    const shiftTypeId = searchParams.get("shiftTypeId");

    // 必須パラメータのバリデーション
    const paramsValidation = validateRequiredParams(
      { date, departmentId, shiftTypeId },
      ["date", "departmentId", "shiftTypeId"]
    );

    if (!paramsValidation.isValid) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: paramsValidation.error || "Invalid parameters",
        },
        { status: 400 }
      );
    }

    // 日付のバリデーション
    const dateValidation = validateDateString(date as string);
    if (!dateValidation.isValid || dateValidation.parsedValue === null) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: dateValidation.error || "Invalid date",
        },
        { status: 400 }
      );
    }

    // IDのバリデーション
    const deptIdValidation = validateStringId(departmentId as string);
    const shiftTypeIdValidation = validateStringId(shiftTypeId as string);

    if (
      !deptIdValidation.isValid ||
      deptIdValidation.parsedValue === null ||
      !shiftTypeIdValidation.isValid ||
      shiftTypeIdValidation.parsedValue === null
    ) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: null,
          error: "Invalid department or shift type ID",
        },
        { status: 400 }
      );
    }

    const parsedDate = dateValidation.parsedValue;
    const parsedDepartmentId = deptIdValidation.parsedValue;
    const parsedShiftTypeId = shiftTypeIdValidation.parsedValue;

    const prisma = await getPrisma();

    // 既存シフトを検索
    const existingShift = await prisma.shift.findFirst({
      where: {
        date: parsedDate,
        departmentId: parsedDepartmentId,
        shiftTypeId: parsedShiftTypeId,
      },
      include: {
        shiftAssignments: {
          select: {
            instructorId: true,
          },
        },
      },
    });

    // モードの判定
    const mode: "edit" | "create" = existingShift ? "edit" : "create";

    // 利用可能なインストラクターを取得
    const availableInstructors = await prisma.instructor.findMany({
      where: {
        status: "ACTIVE",
        certifications: {
          some: {
            certification: {
              departmentId: parsedDepartmentId,
            },
          },
        },
      },
      select: instructorWithCertificationsSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    // 同日の他シフトを取得(競合チェック用)
    const conflictingShifts = await prisma.shift.findMany({
      where: {
        date: parsedDate,
        ...(existingShift && { NOT: { id: existingShift.id } }),
      },
      include: {
        shiftAssignments: {
          select: {
            instructorId: true,
          },
        },
        department: {
          select: {
            name: true,
          },
        },
        shiftType: {
          select: {
            name: true,
          },
        },
      },
    });

    // 競合しているインストラクターのIDを抽出
    const conflictingInstructorIds = new Set(
      conflictingShifts.flatMap((shift) =>
        shift.shiftAssignments.map((assignment) => assignment.instructorId)
      )
    );

    // 現在アサイン済みのインストラクターID
    const assignedInstructorIds = existingShift
      ? existingShift.shiftAssignments.map(
          (assignment) => assignment.instructorId
        )
      : [];

    // インストラクター情報を整形
    const formattedInstructors = availableInstructors.map((instructor) => ({
      id: instructor.id,
      displayName: formatInstructorDisplayName(instructor),
      displayNameKana: formatInstructorDisplayNameKana(instructor),
      status: instructor.status,
      certificationSummary: formatCertificationSummary(
        instructor.certifications
      ),
      isAssigned: assignedInstructorIds.includes(instructor.id),
      hasConflict: conflictingInstructorIds.has(instructor.id),
    }));

    // 競合情報の詳細を生成
    const conflicts = formattedInstructors
      .filter((instructor) => instructor.hasConflict)
      .map((instructor) => {
        // このインストラクターが割り当てられている競合シフトを見つける
        const conflictShift = conflictingShifts.find((shift) =>
          shift.shiftAssignments.some(
            (assignment) => assignment.instructorId === instructor.id
          )
        );

        // 競合シフトが見つからない場合はスキップ(データ不整合の可能性)
        if (!conflictShift) {
          secureLog("warn", "Conflict shift not found for instructor", {
            instructorId: instructor.id,
          });
          return null;
        }

        return {
          instructorId: instructor.id,
          instructorName: instructor.displayName,
          conflictingShift: {
            id: conflictShift.id,
            departmentName: conflictShift.department.name,
            shiftTypeName: conflictShift.shiftType.name,
          },
        };
      })
      .filter((conflict): conflict is NonNullable<typeof conflict> =>
        Boolean(conflict)
      );

    // レスポンスデータを構築
    const responseData = {
      mode,
      shift: existingShift
        ? {
            id: existingShift.id,
            date: date as string,
            departmentId: parsedDepartmentId,
            shiftTypeId: parsedShiftTypeId,
            description: existingShift.description,
            assignedInstructorIds,
          }
        : null,
      availableInstructors: formattedInstructors,
      conflicts,
      formData: {
        date: date as string,
        departmentId: parsedDepartmentId,
        shiftTypeId: parsedShiftTypeId,
        description: existingShift?.description || null,
        selectedInstructorIds: assignedInstructorIds,
      },
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    logApiError("Failed to fetch shift edit data", error);

    return NextResponse.json(
      {
        success: false,
        data: null,
        message: null,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

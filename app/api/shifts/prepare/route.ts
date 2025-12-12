import { type NextRequest, NextResponse } from "next/server";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";

// 既存シフトデータの型定義（レスポンス用）
type ExistingShiftData = {
  id: string;
  date: string;
  departmentId: string;
  shiftTypeId: string;
  description: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  };
  shiftType: {
    id: string;
    name: string;
  };
  assignments: Array<{
    id: string;
    instructor: {
      id: string;
      lastName: string;
      firstName: string;
    };
  }>;
  assignedCount: number;
};

// フォームデータの型定義
type FormData = {
  date: string;
  departmentId: string;
  shiftTypeId: string;
  description: string | null;
  selectedInstructorIds: string[];
};

// 統一レスポンスの型定義
type PrepareShiftResponse = {
  success: boolean;
  data: {
    mode: "create" | "edit";
    shift: ExistingShiftData | null;
    formData: FormData;
  };
  error?: string;
};

// Prismaの型定義
type ShiftWithRelations = {
  id: string;
  date: Date;
  departmentId: string;
  shiftTypeId: string;
  description: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  };
  shiftType: {
    id: string;
    name: string;
  };
  shiftAssignments: Array<{
    id: string;
    instructorId: string;
    instructor: {
      id: string;
      lastName: string;
      firstName: string;
    };
  }>;
};

// 既存シフトデータをレスポンス形式にフォーマットするヘルパー関数
function formatExistingShift(shift: ShiftWithRelations): ExistingShiftData {
  const dateStr = shift.date.toISOString().split("T")[0];
  return {
    id: shift.id,
    date: dateStr ?? "",
    departmentId: shift.departmentId,
    shiftTypeId: shift.shiftTypeId,
    description: shift.description,
    department: {
      id: shift.department.id,
      name: shift.department.name,
      code: shift.department.code,
    },
    shiftType: {
      id: shift.shiftType.id,
      name: shift.shiftType.name,
    },
    assignments: shift.shiftAssignments.map((assignment) => ({
      id: assignment.id,
      instructor: {
        id: assignment.instructor.id,
        lastName: assignment.instructor.lastName,
        firstName: assignment.instructor.firstName,
      },
    })),
    assignedCount: shift.shiftAssignments.length,
  };
}

export async function GET(request: NextRequest) {
  const authResult = await authenticateFromRequest(request);
  if (!authResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Authentication required",
      },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date");
    const departmentId = searchParams.get("departmentId");
    const shiftTypeId = searchParams.get("shiftTypeId");

    // バリデーション
    if (!(date && departmentId && shiftTypeId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Required parameters: date, departmentId, shiftTypeId",
        },
        { status: 400 }
      );
    }

    // 日付フォーマットバリデーション
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid date format",
        },
        { status: 400 }
      );
    }

    // IDパラメータバリデーション
    if (!(departmentId.trim() && shiftTypeId.trim())) {
      return NextResponse.json(
        {
          success: false,
          error: "departmentId and shiftTypeId must not be empty",
        },
        { status: 400 }
      );
    }

    const parsedDepartmentId = departmentId;
    const parsedShiftTypeId = shiftTypeId;

    // ユニーク制約を使って既存シフト検索
    const existingShift = await (await getPrisma()).shift.findUnique({
      where: {
        unique_shift_per_day: {
          date: parsedDate,
          departmentId: parsedDepartmentId,
          shiftTypeId: parsedShiftTypeId,
        },
      },
      include: {
        department: true,
        shiftType: true,
        shiftAssignments: {
          include: {
            instructor: true,
          },
        },
      },
    });

    if (existingShift) {
      // 編集モード：既存データを事前ロード
      const response: PrepareShiftResponse = {
        success: true,
        data: {
          mode: "edit",
          shift: formatExistingShift(existingShift),
          formData: {
            date,
            departmentId: parsedDepartmentId,
            shiftTypeId: parsedShiftTypeId,
            description: existingShift.description,
            selectedInstructorIds: existingShift.shiftAssignments.map(
              (assignment) => assignment.instructorId
            ),
          },
        },
      };

      return NextResponse.json(response);
    }
    // 新規作成モード：空フォーム
    const response: PrepareShiftResponse = {
      success: true,
      data: {
        mode: "create",
        shift: null,
        formData: {
          date,
          departmentId: parsedDepartmentId,
          shiftTypeId: parsedShiftTypeId,
          description: null,
          selectedInstructorIds: [],
        },
      },
    };

    return NextResponse.json(response);
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

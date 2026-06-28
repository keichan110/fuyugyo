// NextResponse import removed as it's only used in return type
import type { NextRequest } from "next/server";
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  withApiErrorHandling,
} from "@/lib/api/response";
import {
  type ApiErrorResponse,
  ApiErrorType,
  type ApiSuccessResponse,
  HttpStatus,
} from "@/lib/api/types";
import { isOneOf } from "@/lib/api/validation";
import { authenticateFromRequest } from "@/lib/auth/middleware";
import { getPrisma } from "@/lib/db";
import type { InstructorStatus } from "@/types/common";

export async function GET(request: NextRequest) {
  // 個人情報保護のため認証必須
  const authResult = await authenticateFromRequest(request);
  if (!authResult.success) {
    return createErrorResponse("Authentication required", {
      type: ApiErrorType.UNAUTHORIZED,
      status: HttpStatus.UNAUTHORIZED,
    });
  }
  return withApiErrorHandling<ApiSuccessResponse<unknown[]> | ApiErrorResponse>(
    async () => {
      const { searchParams } = new URL(request.url);
      const statusParam = searchParams.get("status");
      const departmentIdParam = searchParams.get("departmentId");

      // statusパラメータのバリデーション
      let statusFilter: InstructorStatus | undefined;
      if (statusParam) {
        const statusErrors = isOneOf(["ACTIVE", "INACTIVE", "RETIRED"])(
          statusParam,
          "status"
        );
        if (statusErrors.length > 0) {
          return createValidationErrorResponse(statusErrors);
        }
        statusFilter = statusParam as InstructorStatus;
      }

      // departmentIdパラメータのバリデーション
      let departmentIdFilter: string | undefined;
      if (departmentIdParam) {
        if (!departmentIdParam.trim()) {
          return createValidationErrorResponse([
            {
              field: "departmentId",
              message: "departmentId must not be empty",
            },
          ]);
        }
        departmentIdFilter = departmentIdParam;
      }

      const whereClause: Record<string, unknown> = {};
      if (statusFilter) {
        whereClause.status = statusFilter;
      }
      if (departmentIdFilter) {
        whereClause.certifications = {
          some: {
            certification: {
              departmentId: departmentIdFilter,
            },
          },
        };
      }

      const instructors = await (await getPrisma()).instructor.findMany({
        where: whereClause,
        include: {
          certifications: {
            include: {
              certification: {
                include: {
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });

      // レスポンス形式をOpenAPI仕様に合わせて変換
      const formattedInstructors = instructors.map((instructor) => ({
        id: instructor.id,
        lastName: instructor.lastName,
        firstName: instructor.firstName,
        lastNameKana: instructor.lastNameKana,
        firstNameKana: instructor.firstNameKana,
        status: instructor.status,
        notes: instructor.notes,
        createdAt: instructor.createdAt,
        updatedAt: instructor.updatedAt,
        certifications: instructor.certifications.map((ic) => ({
          id: ic.certification.id,
          name: ic.certification.name,
          shortName: ic.certification.shortName,
          organization: ic.certification.organization,
          department: ic.certification.department,
        })),
      }));

      return createSuccessResponse(formattedInstructors, {
        count: formattedInstructors.length,
      });
    },
    "GET /api/instructors"
  );
}

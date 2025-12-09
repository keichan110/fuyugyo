import type {
  Certification,
  Department,
  Instructor,
  InstructorCertification,
  Shift,
  ShiftAssignment,
  ShiftType,
} from "@prisma/client";
import { getPrisma } from "@/lib/db";
import type { DepartmentMinimal, ShiftTypeMinimal } from "@/lib/types/domain";
import type { InstructorWithAssignment, ShiftWithRelations } from "./types";

type InstructorWithDetails = Instructor & {
  shiftAssignments: (ShiftAssignment & {
    shift: Shift & {
      department: Department;
      shiftType: ShiftType;
    };
  })[];
  certifications: (InstructorCertification & {
    certification: Certification & {
      department: Department;
    };
  })[];
};

/**
 * インストラクターの部門コードを決定する
 *
 * @param instructor - インストラクター情報
 * @param departmentId - 部門ID（指定されている場合）
 * @returns 部門コード
 * @throws インストラクターが必要な資格を持っていない場合
 */
function determineDepartmentCode(
  instructor: InstructorWithDetails,
  departmentId?: number
): string {
  if (departmentId) {
    // 指定された部門IDに対応する資格を探す
    const targetCert = instructor.certifications.find(
      (ic) => ic.certification.departmentId === departmentId
    );
    if (!targetCert) {
      throw new Error(
        `Instructor ${instructor.id} does not have certification for department ${departmentId}`
      );
    }
    return targetCert.certification.department.code;
  }

  const firstAssignment = instructor.shiftAssignments[0];
  if (firstAssignment) {
    return firstAssignment.shift.department.code;
  }

  const firstCertification = instructor.certifications[0];
  if (firstCertification) {
    return firstCertification.certification.department.code;
  }

  // クエリ条件により到達不可能なはずだが、型安全性のため
  throw new Error(`Instructor ${instructor.id} has no certifications`);
}

/**
 * 指定日のシフト一覧を取得
 *
 * @param date - 対象日付 (YYYY-MM-DD)
 * @param departmentId - 部門ID（指定した場合、その部門のシフトのみを取得）
 * @returns シフト一覧（部門・シフト種別の昇順）
 */
export async function getShiftsByDate(
  date: string,
  departmentId?: number
): Promise<ShiftWithRelations[]> {
  const targetDate = new Date(date);

  const shifts = await (await getPrisma()).shift.findMany({
    where: {
      date: targetDate,
      ...(departmentId && { departmentId }),
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
    orderBy: [{ department: { code: "asc" } }, { shiftType: { name: "asc" } }],
  });

  return shifts;
}

/**
 * アクティブなインストラクター一覧を取得（指定日の配置状況も含む）
 *
 * @param date - 対象日付 (YYYY-MM-DD)
 * @param departmentId - 部門ID（指定した場合、その部門の資格を持つインストラクターのみを取得）
 * @returns インストラクター一覧（姓名の昇順）
 */
export async function getInstructorsWithAssignments(
  date: string,
  departmentId?: number
): Promise<InstructorWithAssignment[]> {
  const targetDate = new Date(date);

  const instructors = await (await getPrisma()).instructor.findMany({
    where: {
      status: "ACTIVE",
      certifications: {
        some: departmentId
          ? {
              certification: {
                departmentId,
              },
            }
          : {}, // 何らかの資格を持つインストラクターのみ取得
      },
    },
    include: {
      shiftAssignments: {
        where: {
          shift: {
            date: targetDate,
            ...(departmentId && { departmentId }),
          },
        },
        include: {
          shift: {
            include: {
              department: true,
              shiftType: true,
            },
          },
        },
      },
      certifications: {
        include: {
          certification: {
            include: {
              department: true,
            },
          },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return instructors.map((instructor) => {
    const departmentCode = determineDepartmentCode(instructor, departmentId);

    // 資格情報をフィルタリング（部門IDが指定されている場合はその部門の資格のみ）
    const certifications = instructor.certifications
      .filter((ic) =>
        departmentId ? ic.certification.departmentId === departmentId : true
      )
      .map((ic) => ({
        certificationId: ic.certification.id,
        certificationName: ic.certification.shortName,
        departmentCode: ic.certification.department.code,
      }));

    return {
      id: instructor.id,
      displayName: `${instructor.lastName} ${instructor.firstName}`,
      displayNameKana: `${instructor.lastNameKana ?? ""} ${instructor.firstNameKana ?? ""}`,
      departmentCode,
      assignedToShiftIds: instructor.shiftAssignments.map((a) => a.shiftId),
      assignmentInfo: instructor.shiftAssignments.map((a) => ({
        shiftId: a.shiftId,
        departmentName: a.shift.department.name,
        shiftTypeName: a.shift.shiftType.name,
      })),
      certifications,
    };
  });
}

/**
 * 部門一覧を取得
 *
 * @returns 部門一覧（コードの昇順）
 */
export async function getDepartments(): Promise<DepartmentMinimal[]> {
  const departments = await (await getPrisma()).department.findMany({
    orderBy: { code: "asc" },
  });

  return departments.map((dept) => ({
    id: dept.id,
    name: dept.name,
    code: dept.code,
  }));
}

/**
 * アクティブなシフト種別一覧を取得
 *
 * @returns シフト種別一覧（名前の昇順）
 */
export async function getActiveShiftTypes(): Promise<ShiftTypeMinimal[]> {
  const shiftTypes = await (await getPrisma()).shiftType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return shiftTypes.map((type) => ({
    id: type.id,
    name: type.name,
    isActive: type.isActive,
  }));
}

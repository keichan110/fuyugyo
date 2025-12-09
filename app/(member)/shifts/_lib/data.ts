import { cache } from "react";
import { formatDateString } from "@/app/api/usecases/helpers/formatters";
import {
  departmentMinimalSelect,
  instructorMinimalSelect,
  shiftTypeMinimalSelect,
} from "@/app/api/usecases/helpers/query-optimizers";
import {
  aggregateByDepartment,
  calculateTotalAssignments,
  formatShiftsData,
} from "@/app/api/usecases/helpers/shift-aggregators";
import { getPrisma } from "@/lib/db";

/**
 * 月次ビュー用のシフトデータ型
 */
export type MonthlyViewData = {
  shifts: Array<{
    id: number;
    date: string;
    department: {
      id: number;
      name: string;
      code: string;
    };
    shiftType: {
      id: number;
      name: string;
    };
    assignedInstructors: Array<{
      id: number;
      displayName: string;
    }>;
    stats: {
      assignedCount: number;
      hasNotes: boolean;
    };
    description: string | null;
    /** 現在のユーザーがこのシフトにアサインされているか */
    isMyShift?: boolean;
  }>;
  summary: {
    totalShifts: number;
    totalAssignments: number;
    dateRange: {
      from: string;
      to: string;
    };
    byDepartment: Record<string, number>;
  };
};

/**
 * 週次ビュー用のシフトデータ型
 */
export type WeeklyViewData = MonthlyViewData;

/**
 * 月次カレンダービュー用のシフトデータを取得（Server Component用）
 *
 * @description
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止します。
 * APIルート `/api/usecases/shifts/monthly-view` と同じロジックを使用。
 *
 * @param year - 年 (例: 2025)
 * @param month - 月 (1-12)
 * @returns 月次シフトデータと統計情報
 */
export const getMonthlyShifts = cache(
  async (year: number, month: number): Promise<MonthlyViewData> => {
    // 月の開始日と終了日を計算
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // 月末日

    const prisma = await getPrisma();

    // シフトデータを取得
    const shifts = await prisma.shift.findMany({
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

    return {
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
    };
  }
);

/**
 * 週次カレンダービュー用のシフトデータを取得（Server Component用）
 *
 * @description
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止します。
 * APIルート `/api/usecases/shifts/weekly-view` と同じロジックを使用。
 *
 * @param dateFrom - 週の開始日 (YYYY-MM-DD形式)
 * @returns 週次シフトデータと統計情報
 */
export const getWeeklyShifts = cache(
  async (dateFrom: string): Promise<WeeklyViewData> => {
    const startDate = new Date(dateFrom);

    // 終了日を計算（開始日から6日後 = 7日間）
    const endDate = new Date(startDate);
    const DAYS_IN_WEEK = 7;
    endDate.setDate(endDate.getDate() + DAYS_IN_WEEK - 1);

    const prisma = await getPrisma();

    // シフトデータを取得
    const shifts = await prisma.shift.findMany({
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

    return {
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
    };
  }
);

/**
 * 部門一覧を取得（Server Component用）
 *
 * @description
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止します。
 *
 * @returns 部門一覧
 */
export const getDepartments = cache(async () => {
  const prisma = await getPrisma();

  const departments = await prisma.department.findMany({
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return departments;
});

/**
 * シフト作成フォーム用のマスターデータを取得（Server Component用）
 *
 * @description
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止します。
 * シフト作成モーダルで使用する部門一覧、シフト種別一覧、統計情報を取得します。
 * 既存のAPIエンドポイント `/api/usecases/shifts/form-data` と同じロジックを使用。
 *
 * @returns シフトフォーム用のマスターデータ
 */
export const getShiftFormData = cache(async () => {
  const prisma = await getPrisma();

  const [departments, shiftTypes, activeInstructorCount] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.shiftType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.instructor.count({
      where: { status: "ACTIVE" },
    }),
  ]);

  return {
    departments,
    shiftTypes,
    stats: { activeInstructorCount },
  };
});

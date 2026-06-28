import { cache } from "react";
import { getPrisma } from "@/lib/db";

/**
 * 今後のシフトとして取得するデフォルト件数
 */
const DEFAULT_UPCOMING_SHIFTS_LIMIT = 10;

/**
 * インストラクター向け今後のシフト情報
 */
export type UpcomingShift = {
  id: string;
  date: Date;
  department: {
    id: string;
    name: string;
    code: string;
  };
  shiftType: {
    id: string;
    name: string;
  };
};

/**
 * インストラクターの今後のシフトを取得（React.cacheでメモ化）
 *
 * 同一リクエスト内で複数回呼び出されても、実際のDBクエリは1回のみ実行される
 *
 * @param instructorId - インストラクターID
 * @returns 今後のシフト一覧（日付昇順、最大10件）
 */
export const getUpcomingShifts = cache(
  async (instructorId: string): Promise<UpcomingShift[]> => {
    // 今日の日付（時刻を00:00:00にリセット）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const shifts = await (await getPrisma()).shift.findMany({
      where: {
        date: {
          gte: today,
        },
        shiftAssignments: {
          some: {
            instructorId,
          },
        },
      },
      select: {
        id: true,
        date: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        shiftType: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        date: "asc",
      },
      take: DEFAULT_UPCOMING_SHIFTS_LIMIT,
    });

    return shifts;
  }
);

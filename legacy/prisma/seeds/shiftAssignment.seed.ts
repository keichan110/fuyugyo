import type { PrismaClient } from "@prisma/client";
import { isHoliday } from "japanese-holidays";
import type { DepartmentSeeds } from "./department.seed";
import type { InstructorSeed } from "./instructor.seed";
import type { ShiftSeed } from "./shift.seed";
import type { ShiftTypeSeeds } from "./shiftType.seed";

export async function seedShiftAssignments(
  prisma: PrismaClient,
  shifts: ShiftSeed[],
  instructors: InstructorSeed[],
  departments: DepartmentSeeds,
  shiftTypes: ShiftTypeSeeds
): Promise<void> {
  console.log("シフトアサインを作成中...");

  const { skiDepartment, snowboardDepartment } = departments;
  const {
    generalLessonType,
    groupLessonType,
    badgeTestType,
    prefectureEventType,
  } = shiftTypes;

  // アクティブなインストラクターのみを取得
  const activeInstructors = instructors.filter((i) => i.status === "ACTIVE");

  // インストラクターの資格情報を取得して部門別に分類
  const instructorCertifications =
    await prisma.instructorCertification.findMany({
      include: {
        certification: true,
      },
    });

  // 部門別にインストラクターを分類
  const skiInstructorIds = new Set<string>();
  const snowboardInstructorIds = new Set<string>();

  for (const ic of instructorCertifications) {
    if (ic.certification.departmentId === skiDepartment.id) {
      skiInstructorIds.add(ic.instructorId);
    } else if (ic.certification.departmentId === snowboardDepartment.id) {
      snowboardInstructorIds.add(ic.instructorId);
    }
  }

  const skiInstructors = activeInstructors.filter((i) =>
    skiInstructorIds.has(i.id)
  );
  const snowboardInstructors = activeInstructors.filter((i) =>
    snowboardInstructorIds.has(i.id)
  );

  // シフトタイプと条件に応じた必要人数を決定する関数
  function getRequiredInstructorCount(shift: ShiftSeed): number {
    // UTC基準で日付を処理（shift.seed.tsと一貫性を保つ）
    const shiftDate = new Date(shift.date);
    const dayOfWeek = shiftDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // isHoliday関数用にUTC時刻で0:00:00のDateオブジェクトを作成
    const checkDate = new Date(
      Date.UTC(
        shiftDate.getUTCFullYear(),
        shiftDate.getUTCMonth(),
        shiftDate.getUTCDate()
      )
    );
    const isNationalHoliday = isHoliday(checkDate);
    const isWeekendOrHoliday = isWeekend || isNationalHoliday;

    // スキー一般レッスン
    if (
      shift.departmentId === skiDepartment.id &&
      shift.shiftTypeId === generalLessonType.id
    ) {
      return isWeekendOrHoliday ? 5 : 3; // 休日5人、平日3人
    }

    // スノーボード一般レッスン
    if (
      shift.departmentId === snowboardDepartment.id &&
      shift.shiftTypeId === generalLessonType.id
    ) {
      return 3; // 常に3人
    }

    // バッジテスト（両部門とも3人）
    if (shift.shiftTypeId === badgeTestType.id) {
      return 3;
    }

    // 団体レッスン（2~4人）
    if (shift.shiftTypeId === groupLessonType.id) {
      return Math.floor(Math.random() * 3) + 2; // 2, 3, 4のいずれか
    }

    // 県連事業（1~2人）
    if (shift.shiftTypeId === prefectureEventType.id) {
      return Math.floor(Math.random() * 2) + 1; // 1 or 2
    }

    return 1; // デフォルト
  }

  // 日付ごとに割り当て済みのインストラクターを追跡するマップ
  // key: 日付文字列 (YYYY-MM-DD), value: 割り当て済みインストラクターIDのSet
  const dailyAssignments = new Map<string, Set<string>>();

  // 日付でシフトをグループ化
  const shiftsByDate = new Map<string, ShiftSeed[]>();
  for (const shift of shifts) {
    const shiftDate = new Date(shift.date);
    const dateString = shiftDate.toISOString().split("T")[0];
    if (!dateString) {
      continue;
    }

    if (!shiftsByDate.has(dateString)) {
      shiftsByDate.set(dateString, []);
    }
    shiftsByDate.get(dateString)!.push(shift);
  }

  // シフトにインストラクターを割り当て
  const assignmentsToCreate: Array<{ shiftId: string; instructorId: string }> =
    [];
  let skiInstructorIndex = 0;
  let snowboardInstructorIndex = 0;

  // 日付ごとにシフトを処理
  for (const [dateString, dateShifts] of shiftsByDate) {
    // この日に割り当て済みのインストラクターを管理
    const assignedToday = new Set<string>();
    dailyAssignments.set(dateString, assignedToday);

    // その日のシフトごとにインストラクターを割り当て
    for (const shift of dateShifts) {
      const requiredCount = getRequiredInstructorCount(shift);
      const assignedInstructors: InstructorSeed[] = [];

      // 部門に応じたインストラクタープールを取得
      const instructorPool =
        shift.departmentId === skiDepartment.id
          ? skiInstructors
          : snowboardInstructors;

      if (instructorPool.length === 0) {
        continue; // インストラクターがいない場合はスキップ
      }

      // 必要人数分のインストラクターを割り当て
      let attempts = 0;
      const maxAttempts = instructorPool.length * 2; // 無限ループ防止

      while (
        assignedInstructors.length < requiredCount &&
        attempts < maxAttempts
      ) {
        let instructor: InstructorSeed;

        if (shift.departmentId === skiDepartment.id) {
          instructor =
            skiInstructors[skiInstructorIndex % skiInstructors.length]!;
          skiInstructorIndex++;
        } else {
          instructor =
            snowboardInstructors[
              snowboardInstructorIndex % snowboardInstructors.length
            ]!;
          snowboardInstructorIndex++;
        }

        attempts++;

        // 同じシフトに同じインストラクターを重複して割り当てない
        if (assignedInstructors.some((a) => a.id === instructor.id)) {
          continue;
        }

        // 同じ日に既に割り当てられているインストラクターはスキップ
        if (assignedToday.has(instructor.id)) {
          continue;
        }

        // 割り当て可能
        assignedInstructors.push(instructor);
        assignedToday.add(instructor.id);
      }

      // アサインデータを配列に追加
      for (const instructor of assignedInstructors) {
        assignmentsToCreate.push({
          shiftId: shift.id,
          instructorId: instructor.id,
        });
      }
    }
  }

  // 一括でシフトアサインを作成
  await prisma.shiftAssignment.createMany({
    data: assignmentsToCreate,
  });

  console.log(`シフトアサイン: ${assignmentsToCreate.length}件作成`);
  console.log(`   - スキー担当: ${skiInstructors.length}名`);
  console.log(`   - スノーボード担当: ${snowboardInstructors.length}名`);
}

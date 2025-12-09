import type { PrismaClient } from "@prisma/client";

export interface ShiftTypeSeeds {
  generalLessonType: { id: number; name: string };
  groupLessonType: { id: number; name: string };
  badgeTestType: { id: number; name: string };
  prefectureEventType: { id: number; name: string };
}

export async function seedShiftTypes(
  prisma: PrismaClient
): Promise<ShiftTypeSeeds> {
  console.log("シフト種類を作成中...");

  const generalLessonType = await prisma.shiftType.create({
    data: { name: "一般レッスン" },
  });

  const groupLessonType = await prisma.shiftType.create({
    data: { name: "団体レッスン" },
  });

  const badgeTestType = await prisma.shiftType.create({
    data: { name: "バッジテスト" },
  });

  const prefectureEventType = await prisma.shiftType.create({
    data: { name: "県連事業" },
  });

  console.log(
    `シフト種類: ${generalLessonType.name}, ${groupLessonType.name}, ${badgeTestType.name}, ${prefectureEventType.name}`
  );

  return {
    generalLessonType,
    groupLessonType,
    badgeTestType,
    prefectureEventType,
  };
}

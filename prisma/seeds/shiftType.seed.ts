import type { PrismaClient } from "@prisma/client";

export interface ShiftTypeSeeds {
  generalLessonType: { id: string; name: string };
  groupLessonType: { id: string; name: string };
  badgeTestType: { id: string; name: string };
  prefectureEventType: { id: string; name: string };
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

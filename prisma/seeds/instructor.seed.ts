import { faker } from "@faker-js/faker/locale/ja";
import type { Instructor, PrismaClient } from "@prisma/client";

export interface InstructorSeed {
  id: number;
  lastName: string;
  firstName: string;
  status: string;
}

const INSTRUCTOR_COUNT = 70;
const ACTIVE_RATIO = 0.9; // 90%がアクティブ
const RETIRED_RATIO = 0.07; // 7%が退職
// 残り3%が休職

export async function seedInstructors(
  prisma: PrismaClient
): Promise<InstructorSeed[]> {
  console.log("インストラクターデータを作成中...");

  // データ準備を先に行う
  const instructorData = Array.from({ length: INSTRUCTOR_COUNT }, (_, i) => {
    // ステータスを決定
    let status: "ACTIVE" | "RETIRED" | "INACTIVE";
    const rand = Math.random();
    if (rand < ACTIVE_RATIO) {
      status = "ACTIVE";
    } else if (rand < ACTIVE_RATIO + RETIRED_RATIO) {
      status = "RETIRED";
    } else {
      status = "INACTIVE";
    }

    const lastName = faker.person.lastName();
    const firstName = faker.person.firstName();

    return {
      lastName,
      firstName,
      lastNameKana: "セイ",
      firstNameKana: "メイ",
      status,
      notes: `備考${i + 1}`,
    };
  });

  // Promise.allで並列処理
  const instructors = await Promise.all(
    instructorData.map((data) => prisma.instructor.create({ data }))
  );

  const activeCount = instructors.filter(
    (i: Instructor) => i.status === "ACTIVE"
  ).length;
  const retiredCount = instructors.filter(
    (i: Instructor) => i.status === "RETIRED"
  ).length;
  const inactiveCount = instructors.filter(
    (i: Instructor) => i.status === "INACTIVE"
  ).length;

  console.log(
    `インストラクター: ${instructors.length}名作成 (アクティブ${activeCount}名、退職${retiredCount}名、休職${inactiveCount}名)`
  );

  return instructors;
}

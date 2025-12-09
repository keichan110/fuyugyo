import { PrismaClient } from "@prisma/client";
import { seedCertifications } from "./seeds/certification.seed";
import { seedDepartments } from "./seeds/department.seed";
import { seedInstructors } from "./seeds/instructor.seed";
import { seedInstructorCertifications } from "./seeds/instructorCertification.seed";
import { seedShifts } from "./seeds/shift.seed";
import { seedShiftAssignments } from "./seeds/shiftAssignment.seed";
import { seedShiftTypes } from "./seeds/shiftType.seed";

const prisma = new PrismaClient();

async function main() {
  console.log("スキー・スノーボードスクール 初期データ投入開始...\n");

  // 既存データをクリア（開発用）
  console.log("既存データをクリア中...");
  await prisma.shiftAssignment.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.instructorCertification.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.shiftType.deleteMany();
  await prisma.department.deleteMany();
  console.log("既存データのクリア完了\n");

  // 1. 部門データ
  const departments = await seedDepartments(prisma);

  // 2. シフト種類データ
  const shiftTypes = await seedShiftTypes(prisma);

  // 3. 資格データ
  const certifications = await seedCertifications(prisma, departments);

  // 4. インストラクターデータ（faker使用）
  const instructors = await seedInstructors(prisma);

  // 5. インストラクター資格関連（ランダム割り当て）
  await seedInstructorCertifications(prisma, instructors, certifications);

  // 6. シフトデータ
  const shifts = await seedShifts(prisma, departments, shiftTypes);

  // 7. シフトアサイン
  await seedShiftAssignments(
    prisma,
    shifts,
    instructors,
    departments,
    shiftTypes
  );

  // サマリー出力
  console.log("\n初期データ投入完了！");
  console.log("\n投入データサマリー:");
  console.log("  - 部門: 2件 (スキー, スノーボード)");
  console.log(
    "  - シフト種類: 4件 (一般レッスン, 団体レッスン, バッジテスト, 県連事業)"
  );
  console.log(
    `  - 資格: ${certifications.skiCertifications.length + certifications.snowboardCertifications.length}件 (スキー${certifications.skiCertifications.length}件, スノーボード${certifications.snowboardCertifications.length}件)`
  );
  console.log(`  - インストラクター: ${instructors.length}名`);

  const statusCounts = instructors.reduce(
    (acc, instructor) => {
      acc[instructor.status] = (acc[instructor.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log(`    - アクティブ: ${statusCounts.ACTIVE || 0}名`);
  console.log(`    - 退職: ${statusCounts.RETIRED || 0}名`);
  console.log(`    - 休職: ${statusCounts.INACTIVE || 0}名`);
  // シフト期間の計算
  const shiftDates = shifts.map((s) => new Date(s.date));
  const minDate = new Date(Math.min(...shiftDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...shiftDates.map((d) => d.getTime())));
  const formatDate = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return `${year}/${month}/${day}`;
  };

  console.log(
    `  - シフト: ${shifts.length}件 (${formatDate(minDate)}〜${formatDate(maxDate)})`
  );
  console.log(
    "\n開発準備完了！Fuyugyō - 運営管理システムの全データが整備されました。"
  );
}

main()
  .catch((e) => {
    console.error("シードデータ投入エラー:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

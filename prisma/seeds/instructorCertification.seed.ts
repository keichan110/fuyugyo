import type { PrismaClient } from "@prisma/client";
import type { CertificationSeeds } from "./certification.seed";
import type { InstructorSeed } from "./instructor.seed";

// 資格セットのパターン定義
// スキー資格インデックス: [0]公認指導員, [1]公認準指導員, [2]認定指導員, [3]A級検定員, [4]B級検定員, [5]C級検定員
// スノーボード資格インデックス: [0]公認指導員, [1]公認準指導員, [2]認定指導員, [3]A級検定員, [4]B級検定員, [5]C級検定員

type CertPattern = {
  type: "ski" | "snowboard" | "both";
  certIndices: {
    ski?: number[];
    snowboard?: number[];
  };
  weight: number; // 出現確率の重み
};

// 資格パターン定義
const CERTIFICATION_PATTERNS: CertPattern[] = [
  // === スキー専門パターン ===
  { type: "ski", certIndices: { ski: [0, 3] }, weight: 24 }, // 指導員 + A級検定員
  { type: "ski", certIndices: { ski: [0, 4] }, weight: 30 }, // 指導員 + B級検定員
  { type: "ski", certIndices: { ski: [0, 5] }, weight: 36 }, // 指導員 + C級検定員
  { type: "ski", certIndices: { ski: [0] }, weight: 30 }, // 指導員
  { type: "ski", certIndices: { ski: [1, 5] }, weight: 24 }, // 準指導員 + C級検定員
  { type: "ski", certIndices: { ski: [1] }, weight: 24 }, // 準指導員
  { type: "ski", certIndices: { ski: [2] }, weight: 18 }, // 認定指導員

  // === スノーボード専門パターン ===
  { type: "snowboard", certIndices: { snowboard: [0, 3] }, weight: 8 }, // 指導員 + A級検定員
  { type: "snowboard", certIndices: { snowboard: [0, 4] }, weight: 10 }, // 指導員 + B級検定員
  { type: "snowboard", certIndices: { snowboard: [0, 5] }, weight: 12 }, // 指導員 + C級検定員
  { type: "snowboard", certIndices: { snowboard: [0] }, weight: 10 }, // 指導員
  { type: "snowboard", certIndices: { snowboard: [1, 5] }, weight: 8 }, // 準指導員 + C級検定員
  { type: "snowboard", certIndices: { snowboard: [1] }, weight: 8 }, // 準指導員
  { type: "snowboard", certIndices: { snowboard: [2] }, weight: 6 }, // 認定指導員

  // === 両方の資格保持パターン ===
  { type: "both", certIndices: { ski: [1, 5], snowboard: [2] }, weight: 2 }, // スキー準指導員+C級検定員 + スノボ認定指導員
  { type: "both", certIndices: { ski: [2], snowboard: [2] }, weight: 1 }, // スキー認定指導員 + スノボ認定指導員
];

// 重み付きランダム選択
function selectRandomPattern(): CertPattern {
  const totalWeight = CERTIFICATION_PATTERNS.reduce(
    (sum, pattern) => sum + pattern.weight,
    0
  );
  let random = Math.random() * totalWeight;

  for (const pattern of CERTIFICATION_PATTERNS) {
    random -= pattern.weight;
    if (random <= 0) {
      return pattern;
    }
  }

  return CERTIFICATION_PATTERNS[0]!; // フォールバック
}

export async function seedInstructorCertifications(
  prisma: PrismaClient,
  instructors: InstructorSeed[],
  certifications: CertificationSeeds
): Promise<void> {
  console.log("インストラクター資格関連を作成中...");

  const { skiCertifications, snowboardCertifications } = certifications;

  let skiOnlyCount = 0;
  let snowboardOnlyCount = 0;
  let bothCount = 0;

  // 一括挿入用の配列
  const instructorCertificationsData: {
    instructorId: string;
    certificationId: string;
  }[] = [];

  // 全インストラクターに資格を割り当て
  for (const instructor of instructors) {
    const pattern = selectRandomPattern();

    // スキー資格の割り当て
    if (pattern.certIndices.ski) {
      for (const certIndex of pattern.certIndices.ski) {
        const certification = skiCertifications[certIndex];
        if (certification) {
          instructorCertificationsData.push({
            instructorId: instructor.id,
            certificationId: certification.id,
          });
        }
      }
    }

    // スノーボード資格の割り当て
    if (pattern.certIndices.snowboard) {
      for (const certIndex of pattern.certIndices.snowboard) {
        const certification = snowboardCertifications[certIndex];
        if (certification) {
          instructorCertificationsData.push({
            instructorId: instructor.id,
            certificationId: certification.id,
          });
        }
      }
    }

    // カウント
    if (pattern.type === "ski") {
      skiOnlyCount++;
    } else if (pattern.type === "snowboard") {
      snowboardOnlyCount++;
    } else {
      bothCount++;
    }
  }

  // 一括挿入
  await prisma.instructorCertification.createMany({
    data: instructorCertificationsData,
  });

  console.log(
    `インストラクター資格関連: ${instructorCertificationsData.length}件作成完了`
  );
  console.log(`   - スキー専門: ${skiOnlyCount}名`);
  console.log(`   - スノーボード専門: ${snowboardOnlyCount}名`);
  console.log(`   - 両方の資格保持: ${bothCount}名`);
}

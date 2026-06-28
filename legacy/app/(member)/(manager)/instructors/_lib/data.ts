import { cache } from "react";
import { getPrisma } from "@/lib/db";
import type { InstructorWithCertifications } from "./types";

/**
 * インストラクター一覧を取得（Server Component用）
 * React.cacheでメモ化され、同一リクエスト内での重複クエリを防止
 */
export const getInstructors = cache(
  async (): Promise<InstructorWithCertifications[]> => {
    const instructors = await (await getPrisma()).instructor.findMany({
      include: {
        certifications: {
          include: {
            certification: {
              select: {
                id: true,
                name: true,
                shortName: true,
                organization: true,
                department: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    });

    // InstructorCertificationの中間テーブルを展開して
    // InstructorWithCertifications型に変換
    // Date型をISO 8601文字列に変換してシリアライズ可能にする
    return instructors.map((instructor) => ({
      ...instructor,
      createdAt: instructor.createdAt.toISOString(),
      updatedAt: instructor.updatedAt.toISOString(),
      certifications: instructor.certifications.map((ic) => ic.certification),
    }));
  }
);

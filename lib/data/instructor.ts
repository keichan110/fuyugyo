import { cache } from "react";
import { getPrisma } from "@/lib/db";
import type { UserInstructorProfile } from "@/types/actions";

/**
 * インストラクタープロファイルを取得（React.cacheでメモ化）
 *
 * 同一リクエスト内で複数回呼び出されても、実際のDBクエリは1回のみ実行される
 *
 * @param instructorId - インストラクターID
 * @returns インストラクタープロファイル（存在しない場合はnull）
 */
export const getInstructorProfile = cache(
  async (instructorId: number): Promise<UserInstructorProfile | null> => {
    const instructor = await (await getPrisma()).instructor.findUnique({
      where: { id: instructorId },
      include: {
        certifications: {
          include: {
            certification: {
              select: {
                id: true,
                name: true,
                shortName: true,
                organization: true,
              },
            },
          },
        },
      },
    });

    if (!instructor) {
      return null;
    }

    return {
      id: instructor.id,
      lastName: instructor.lastName,
      firstName: instructor.firstName,
      lastNameKana: instructor.lastNameKana,
      firstNameKana: instructor.firstNameKana,
      status: instructor.status,
      certifications: instructor.certifications.map((ic) => ic.certification),
    };
  }
);

/**
 * 利用可能なインストラクター一覧を取得（React.cacheでメモ化）
 *
 * 同一リクエスト内で複数回呼び出されても、実際のDBクエリは1回のみ実行される
 *
 * @returns ACTIVEステータスのインストラクター一覧（カナ順ソート）
 */
export const getAvailableInstructors = cache(
  async () =>
    await (await getPrisma()).instructor.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        status: true,
      },
      orderBy: [{ lastNameKana: "asc" }, { firstNameKana: "asc" }],
    })
);

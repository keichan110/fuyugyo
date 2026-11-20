import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import type { Database } from '@/server/db/client';
import { users } from '@/server/db/schema';

/**
 * JWT のユーザー ID からリンク済みの instructorId を解決する。
 * 本人向け API の入力元を DB の連携情報に固定するための共通処理。
 * ユーザーが存在しない、または Instructor 未連携の場合は 403 を投げる。
 * @param db - Drizzle の DB クライアント
 * @param userId - JWT クレームのユーザー ID
 * @returns 連携済みの instructorId
 */
export async function resolveInstructorId(db: Database, userId: string): Promise<string> {
  const [user] = await db
    .select({ instructorId: users.instructorId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.instructorId) {
    throw new HTTPException(403, {
      message: 'インストラクターに連携されたユーザーのみ利用できます',
    });
  }
  return user.instructorId;
}

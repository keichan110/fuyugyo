/**
 * ローカル開発用シードスクリプト。
 * 招待トークン作成には `invitation_tokens.created_by` (NOT NULL FK) を満たす User が必要だが、
 * 初回はユーザーが1人もいない。DB へ直接 INSERT する（API のロールチェックは経由しない）ため、
 * FK を満たすためだけの非アクティブな placeholder User と、
 * 実際の LINE アカウントでログインするための恒久招待トークンを冪等に用意する。
 */
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';

import { invitationTokens, users } from '../src/server/db/schema.ts';
import { getLocalD1Path } from './lib/get-local-d1-path.ts';

/** シードで使う placeholder User の line_user_id（実際の LINE アカウントとは紐付かない） */
const SEED_PLACEHOLDER_LINE_USER_ID = 'dev-seed-placeholder';
/** ローカル開発用の恒久招待トークン */
const DEV_INVITE_TOKEN = 'dev-invite';

async function main() {
  const client = createClient({ url: `file:${getLocalD1Path()}` });
  try {
    const db = drizzle(client);

    const [existingPlaceholder] = await db
      .select()
      .from(users)
      .where(eq(users.lineUserId, SEED_PLACEHOLDER_LINE_USER_ID))
      .limit(1);

    const [placeholderUser] = existingPlaceholder
      ? [existingPlaceholder]
      : await db
          .insert(users)
          .values({
            lineUserId: SEED_PLACEHOLDER_LINE_USER_ID,
            displayName: 'Seed Placeholder',
            isActive: false,
          })
          .returning();

    if (!placeholderUser) {
      throw new Error('placeholder User の作成に失敗しました');
    }

    const [existingInvite] = await db
      .select()
      .from(invitationTokens)
      .where(eq(invitationTokens.token, DEV_INVITE_TOKEN))
      .limit(1);

    if (!existingInvite) {
      await db.insert(invitationTokens).values({
        token: DEV_INVITE_TOKEN,
        expiresAt: new Date('2099-01-01'),
        createdBy: placeholderUser.id,
        maxUses: null,
        description: 'ローカル開発用の恒久招待トークン',
      });
    }

    console.log('シード完了');
    console.log(`招待URL: http://localhost:5173/api/auth/line/login?invite=${DEV_INVITE_TOKEN}`);
  } finally {
    client.close();
  }
}

main();

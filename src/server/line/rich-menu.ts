/**
 * LINE のユーザー個別リッチメニューを、インストラクター紐付けの状態に合わせて切り替える。
 *
 * 呼び出し元の処理を失敗させないよう例外は投げず、再試行もしない。
 * 失敗の通知には固定の操作名と HTTP ステータスまたは失敗種別だけを使う。
 */

import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { createDb } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { captureExternalApiError, captureOperationFailure } from '@/server/sentry';
import type { Env } from '@/server/types';

import { INSTRUCTOR_ALIAS_ID } from './rich-menu-alias';

const API_BASE = 'https://api.line.me/v2/bot';
const TIMEOUT_MS = 5000;

/** 通知に使う固定の操作名。動的な URL は LINE ユーザー ID を含むため通知しない。 */
const OPERATIONS = {
  checkUser: 'line.richmenu.user.check',
  getAlias: 'line.richmenu.alias.get',
  linkUser: 'line.richmenu.user.link',
  unlinkUser: 'line.richmenu.user.unlink',
} as const;

const aliasSchema = z.object({ richMenuId: z.string().min(1) });

/**
 * Messaging API に要求を送る。
 *
 * @returns 成功応答の本文。失敗した場合は通知して `null`
 */
async function requestLineApi(
  accessToken: string,
  operation: string,
  method: 'GET' | 'POST' | 'DELETE',
  segments: string[],
): Promise<string | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const url = `${API_BASE}/${segments.map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    if (!response.ok) {
      captureExternalApiError(operation, response.status);
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return await response.text();
  } catch {
    captureOperationFailure(operation, signal.aborted ? 'timeout' : 'network_error');
    return null;
  }
}

/** 連携済み用エイリアスが現在指しているメニュー ID を照会する。 */
async function fetchInstructorMenuId(accessToken: string): Promise<string | null> {
  const body = await requestLineApi(accessToken, OPERATIONS.getAlias, 'GET', [
    'richmenu',
    'alias',
    INSTRUCTOR_ALIAS_ID,
  ]);
  if (body === null) return null;
  try {
    return aliasSchema.parse(JSON.parse(body)).richMenuId;
  } catch {
    captureOperationFailure(OPERATIONS.getAlias, 'invalid_response');
    return null;
  }
}

/** 最新の D1 で、有効かつインストラクター紐付け済みのユーザーかを確認する。 */
async function isActiveInstructorUser(env: Env, lineUserId: string): Promise<boolean> {
  try {
    const [row] = await createDb(env.DB)
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.lineUserId, lineUserId),
          eq(users.isActive, true),
          isNotNull(users.instructorId),
        ),
      )
      .limit(1);
    return row !== undefined;
  } catch {
    // D1 の例外はクエリの引数（LINE ユーザー ID）を含み得るため、元の例外は通知しない
    captureOperationFailure(OPERATIONS.checkUser, 'db_error');
    return false;
  }
}

/**
 * 有効かつインストラクター紐付け済みのユーザーに、連携済み用の個別リッチメニューを割り当てる。
 * 対象外のユーザーには LINE API を呼ばない。
 *
 * @param env Worker のバインディング
 * @param lineUserId 対象者の LINE ユーザー ID
 */
export async function assignInstructorRichMenu(env: Env, lineUserId: string): Promise<void> {
  if (!(await isActiveInstructorUser(env, lineUserId))) return;

  const accessToken = env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    captureOperationFailure(OPERATIONS.linkUser, 'not_configured');
    return;
  }
  const richMenuId = await fetchInstructorMenuId(accessToken);
  if (richMenuId === null) return;

  // エイリアスの照会中に解除・無効化され得るため、割り当ての直前にもう一度確認する
  if (!(await isActiveInstructorUser(env, lineUserId))) return;
  await requestLineApi(accessToken, OPERATIONS.linkUser, 'POST', [
    'user',
    lineUserId,
    'richmenu',
    richMenuId,
  ]);
}

/**
 * ユーザーの個別リッチメニューを解除し、デフォルトのメニューへ戻す。
 *
 * @param env Worker のバインディング
 * @param lineUserId 対象者の LINE ユーザー ID
 */
export async function unlinkUserRichMenu(env: Env, lineUserId: string): Promise<void> {
  const accessToken = env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    captureOperationFailure(OPERATIONS.unlinkUser, 'not_configured');
    return;
  }
  await requestLineApi(accessToken, OPERATIONS.unlinkUser, 'DELETE', [
    'user',
    lineUserId,
    'richmenu',
  ]);
}

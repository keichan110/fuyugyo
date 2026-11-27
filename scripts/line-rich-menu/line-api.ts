import { z } from 'zod';

import type { RichMenuDefinition } from './definitions.ts';

const API_ORIGIN = 'https://api.line.me';
// 画像のアップロードとダウンロードだけはホストが異なる
const DATA_ORIGIN = 'https://api-data.line.me';
const TIMEOUT_MS = 30_000;

const botInfoSchema = z.object({ basicId: z.string(), premiumId: z.string().optional() });
const createdSchema = z.object({ richMenuId: z.string() });
const menuListSchema = z.object({
  richmenus: z.array(z.object({ richMenuId: z.string(), name: z.string() })),
});
const defaultSchema = z.object({ richMenuId: z.string() });
const aliasSchema = z.object({ richMenuAliasId: z.string(), richMenuId: z.string() });
const aliasListSchema = z.object({ aliases: z.array(aliasSchema) });
const progressSchema = z.object({ phase: z.enum(['ongoing', 'succeeded', 'failed']) });

/** 一括置換の進行状況。 */
export type ReplacementPhase = z.infer<typeof progressSchema>['phase'];

/** 一覧で扱うリッチメニュー。 */
export type RichMenuSummary = z.infer<typeof menuListSchema>['richmenus'][number];

/** LINE API の呼び出し失敗。`status` が `null` の場合は応答を得られていない。 */
export class LineApiError extends Error {
  readonly status: number | null;

  constructor(request: string, status: number | null, detail: string) {
    super(`LINE API ${request} に失敗しました（${status ?? '応答なし'}）: ${detail}`);
    this.name = 'LineApiError';
    this.status = status;
  }

  /** 要求が LINE 側で適用されたかどうか判断できない失敗かを返す。 */
  get isOutcomeUnknown(): boolean {
    return this.status === null || this.status >= 500;
  }
}

/** リッチメニューの公開に使う Messaging API の操作。 */
export type LineApi = ReturnType<typeof createLineApi>;

/**
 * Messaging API のクライアントを作る。
 *
 * @param options.accessToken チャネルアクセストークン
 * @param options.fetch HTTP 送信の実装
 * @returns リッチメニュー操作の一式
 */
export function createLineApi(options: { accessToken: string; fetch: typeof fetch }) {
  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body?: { type: string; content: string | Uint8Array<ArrayBuffer> },
  ) {
    const label = `${method} ${new URL(url).pathname}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${options.accessToken}` };
    if (body) headers['Content-Type'] = body.type;

    try {
      const response = await options.fetch(url, {
        method,
        headers,
        body: body?.content ?? null,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { label, status: response.status, headers: response.headers, bytes };
    } catch (error) {
      throw new LineApiError(label, null, error instanceof Error ? error.message : String(error));
    }
  }

  type Result = Awaited<ReturnType<typeof request>>;

  function failure(result: Result): LineApiError {
    const text = new TextDecoder().decode(result.bytes);
    return new LineApiError(result.label, result.status, text.slice(0, 500));
  }

  function ensureOk(result: Result): Result {
    if (result.status >= 200 && result.status < 300) return result;
    throw failure(result);
  }

  function parse<T>(result: Result, schema: z.ZodType<T>): T {
    ensureOk(result);
    try {
      return schema.parse(JSON.parse(new TextDecoder().decode(result.bytes)));
    } catch {
      // 成功応答を読めない場合は、適用の成否が分からない失敗として扱う
      throw new LineApiError(result.label, null, '応答の形式が想定と異なります');
    }
  }

  const json = (value: unknown) => ({ type: 'application/json', content: JSON.stringify(value) });
  const menuUrl = (richMenuId: string) =>
    `${API_ORIGIN}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`;
  const contentUrl = (richMenuId: string) =>
    `${DATA_ORIGIN}/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`;
  const aliasUrl = (aliasId: string) =>
    `${API_ORIGIN}/v2/bot/richmenu/alias/${encodeURIComponent(aliasId)}`;

  return {
    /** アクセストークンが属する公式アカウントの ID を取得する。 */
    async getBotInfo() {
      return parse(await request('GET', `${API_ORIGIN}/v2/bot/info`), botInfoSchema);
    },

    /** Messaging API で作成されたメニューの一覧を取得する。 */
    async listRichMenus(): Promise<RichMenuSummary[]> {
      const result = await request('GET', `${API_ORIGIN}/v2/bot/richmenu/list`);
      return parse(result, menuListSchema).richmenus;
    },

    /** メニューを作成して ID を返す。 */
    async createRichMenu(menu: RichMenuDefinition & { name: string }): Promise<string> {
      const result = await request('POST', `${API_ORIGIN}/v2/bot/richmenu`, json(menu));
      return parse(result, createdSchema).richMenuId;
    },

    /** 登録済みの画像を取得する。未登録なら `null`。 */
    async getImage(richMenuId: string): Promise<Uint8Array | null> {
      const result = await request('GET', contentUrl(richMenuId));
      return result.status === 404 ? null : ensureOk(result).bytes;
    },

    /** JPEG 画像を登録する。登録済みの画像は差し替えられない。 */
    async uploadImage(richMenuId: string, image: Uint8Array<ArrayBuffer>): Promise<void> {
      const body = { type: 'image/jpeg', content: image };
      ensureOk(await request('POST', contentUrl(richMenuId), body));
    },

    /** デフォルトのメニュー ID を取得する。未設定なら `null`。 */
    async getDefaultId(): Promise<string | null> {
      const result = await request('GET', `${API_ORIGIN}/v2/bot/user/all/richmenu`);
      return result.status === 404 ? null : parse(result, defaultSchema).richMenuId;
    },

    /** デフォルトのメニューを設定する。 */
    async setDefault(richMenuId: string): Promise<void> {
      const url = `${API_ORIGIN}/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`;
      ensureOk(await request('POST', url));
    },

    /** エイリアスが指すメニュー ID を取得する。エイリアスが無ければ `null`。 */
    async getAliasTarget(aliasId: string): Promise<string | null> {
      const result = await request('GET', aliasUrl(aliasId));
      return result.status === 404 ? null : parse(result, aliasSchema).richMenuId;
    },

    /** すべてのエイリアスを取得する。 */
    async listAliases() {
      const result = await request('GET', `${API_ORIGIN}/v2/bot/richmenu/alias/list`);
      return parse(result, aliasListSchema).aliases;
    },

    /** エイリアスを作成する。 */
    async createAlias(aliasId: string, richMenuId: string): Promise<void> {
      const body = json({ richMenuAliasId: aliasId, richMenuId });
      ensureOk(await request('POST', `${API_ORIGIN}/v2/bot/richmenu/alias`, body));
    },

    /** 既存のエイリアスの参照先を変更する。 */
    async updateAlias(aliasId: string, richMenuId: string): Promise<void> {
      ensureOk(await request('POST', aliasUrl(aliasId), json({ richMenuId })));
    },

    /**
     * 旧メニューに個別に割り当てられたユーザーを新メニューへ移す要求を送る。
     *
     * @returns 状態照会に使うリクエスト ID
     */
    async startReplacement(from: string, to: string, resumeRequestKey: string): Promise<string> {
      const result = await request(
        'POST',
        `${API_ORIGIN}/v2/bot/richmenu/batch`,
        json({ operations: [{ type: 'link', from, to }], resumeRequestKey }),
      );
      // 同じキーの要求が受付済みの場合は、受け付けた側の ID で状態を追える
      const accepted = result.headers.get('x-line-accepted-request-id');
      if (accepted) return accepted;
      ensureOk(result);
      const requestId = result.headers.get('x-line-request-id');
      if (!requestId) throw new LineApiError(result.label, null, 'リクエスト ID がありません');
      return requestId;
    },

    /** 一括置換の状態を取得する。ID が無効・期限切れなら `null`。 */
    async getReplacementPhase(requestId: string): Promise<ReplacementPhase | null> {
      const query = new URLSearchParams({ requestId });
      const result = await request(
        'GET',
        `${API_ORIGIN}/v2/bot/richmenu/progress/batch?${query.toString()}`,
      );
      if (result.status === 400 || result.status === 404) return null;
      return parse(result, progressSchema).phase;
    },

    /** メニューを削除する。削除済みの場合は成功とみなす。 */
    async deleteRichMenu(richMenuId: string): Promise<void> {
      const result = await request('DELETE', menuUrl(richMenuId));
      if (result.status === 404) return;
      ensureOk(result);
    },
  };
}

import { createHash } from 'node:crypto';

import {
  buildDefinitions,
  INSTRUCTOR_ALIAS_ID,
  isManagedName,
  managedName,
} from './definitions.ts';
import type { Purpose, RichMenuDefinition } from './definitions.ts';
import { LineApiError } from './line-api.ts';
import type { LineApi, ReplacementPhase, RichMenuSummary } from './line-api.ts';

/** LINE 側の反映を待って確認し直す回数と間隔。エイリアス更新はキャッシュで遅れることがある。 */
const CONFIRM_ATTEMPTS = 10;
const CONFIRM_INTERVAL_MS = 3_000;
/** 一括置換の状態照会は 1 時間 100 回までのため、間隔を空けて回数を抑える。 */
const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 15_000;
/** 1 回の実行で同じ置換を送る回数。一括置換は 1 時間 3 回までのため増やさない。 */
const SEND_ATTEMPTS = 2;

/** 個別割り当てがあり得る連携済み用を、回数制限の中で先に移行する。 */
const MIGRATION_ORDER: readonly Purpose[] = ['instructor', 'default'];

/** 過去の実行で受け付けられた一括置換。 */
export type KnownRequest = { from: string; to: string; requestId: string };

/** 公開処理の入力。 */
export type PublishOptions = {
  api: LineApi;
  officialAccountId: string;
  liffUrl: string;
  images: Record<Purpose, Uint8Array<ArrayBuffer>>;
  /** アプリ側の割り当て処理の停止と、処理中の要求の完了を確認済みか */
  assignmentStopped: boolean;
  knownRequests: KnownRequest[];
  sleep: (milliseconds: number) => Promise<void>;
  log: (message: string) => void;
};

/** 公開処理の結果。 */
export type PublishResult = {
  menuIds: Record<Purpose, string>;
  deletedIds: string[];
  retainedIds: string[];
};

type Target = {
  name: string;
  definition: RichMenuDefinition;
  image: Uint8Array<ArrayBuffer>;
};

/**
 * 旧 ID と新 ID の組から、一括置換の再開キーを決定的に作る。
 *
 * @param from 旧メニュー ID
 * @param to 新メニュー ID
 * @returns 64 文字の 16 進文字列
 */
export function resumeRequestKey(from: string, to: string): string {
  return createHash('sha256').update(`fuyugyo-richmenu-batch:${from}:${to}`).digest('hex');
}

/**
 * `旧ID:新ID:リクエストID` のカンマ区切りを解析する。
 *
 * 別の組の成功を取り違えて旧版を消さないよう、リクエスト ID は組と一緒に指定させる。
 *
 * @param text 入力値。空文字は指定なし
 * @returns 解析した一覧
 * @throws 形式が異なる場合
 */
export function parseKnownRequests(text: string): KnownRequest[] {
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map((entry) => {
      const [from, to, requestId, ...rest] = entry.split(':').map((part) => part.trim());
      if (!from || !to || !requestId || rest.length > 0) {
        throw new Error(
          `batch_request_ids は「旧ID:新ID:リクエストID」で指定してください: ${entry}`,
        );
      }
      return { from, to, requestId };
    });
}

/**
 * リッチメニューを公開し、旧版の個別割り当てを移してから旧版を削除する。
 *
 * 状態は LINE 側の一覧から毎回組み立てるため、どの段階で失敗しても同じ入力の再実行で再開できる。
 *
 * @param options 公開処理の入力
 * @returns 適用した ID と、削除・保持した旧版
 * @throws 安全に先へ進めない場合。旧版は削除せずに残す
 */
export async function publishRichMenus(options: PublishOptions): Promise<PublishResult> {
  const { api, sleep, log } = options;

  const bot = await api.getBotInfo();
  if (![bot.basicId, bot.premiumId].includes(options.officialAccountId)) {
    throw new Error(
      `公式アカウント ID が一致しません。トークンのアカウントは ${bot.basicId} です。`,
    );
  }

  const definitions = buildDefinitions(options.liffUrl);
  const target = (purpose: Purpose): Target => {
    const definition = definitions[purpose];
    const image = options.images[purpose];
    return { name: managedName(purpose, definition, image), definition, image };
  };
  const targets: Record<Purpose, Target> = {
    default: target('default'),
    instructor: target('instructor'),
  };

  const existing = await preflight(targets);

  // 両方の準備と画像の確認が終わるまで、利用者に見える設定は変えない
  const menuIds: Record<Purpose, string> = {
    default: await prepare('default', existing.default),
    instructor: await prepare('instructor', existing.instructor),
  };

  await switchTo(
    'デフォルトのメニュー',
    menuIds.default,
    () => api.getDefaultId(),
    () => api.setDefault(menuIds.default),
  );
  let aliasExists = false;
  await switchTo(
    `エイリアス ${INSTRUCTOR_ALIAS_ID}`,
    menuIds.instructor,
    async () => {
      const current = await api.getAliasTarget(INSTRUCTOR_ALIAS_ID);
      aliasExists = current !== null;
      return current;
    },
    () =>
      aliasExists
        ? api.updateAlias(INSTRUCTOR_ALIAS_ID, menuIds.instructor)
        : api.createAlias(INSTRUCTOR_ALIAS_ID, menuIds.instructor),
  );

  const deletedIds: string[] = [];
  const retainedIds: string[] = [];
  const menus = await api.listRichMenus();
  for (const purpose of MIGRATION_ORDER) {
    for (const old of oldMenus(menus, purpose, targets[purpose].name)) {
      // 画像の無いメニューは割り当てられず置換元にもできない。移行成功を確認できないため残す
      if ((await api.getImage(old.richMenuId)) === null) {
        log(`画像が未登録の旧版を保持します: ${old.richMenuId}（${old.name}）`);
        retainedIds.push(old.richMenuId);
        continue;
      }
      await replaceAssignments(old.richMenuId, menuIds[purpose]);
      await ensureUnreferenced(old.richMenuId);
      await deleteMenu(old.richMenuId);
      deletedIds.push(old.richMenuId);
    }
  }

  return { menuIds, deletedIds, retainedIds };

  /** 公開を始められる状態かを、LINE 側を変更する前に確認する。 */
  async function preflight(
    wanted: Record<Purpose, Target>,
  ): Promise<Record<Purpose, string | null>> {
    const list = await api.listRichMenus();
    const currentIds: Record<Purpose, string | null> = {
      default: await api.getDefaultId(),
      instructor: await api.getAliasTarget(INSTRUCTOR_ALIAS_ID),
    };
    const found: Record<Purpose, string | null> = { default: null, instructor: null };
    let hasPublishedOld = false;

    for (const purpose of MIGRATION_ORDER) {
      found[purpose] = findByName(list, wanted[purpose].name);

      const published: RichMenuSummary[] = [];
      for (const old of oldMenus(list, purpose, wanted[purpose].name)) {
        if ((await api.getImage(old.richMenuId)) !== null) published.push(old);
      }
      hasPublishedOld ||= published.length > 0;

      // 適用中の版より古い版が残っていれば移行の途中。別の版を重ねると割り当てが取り残される
      const current = list.find((menu) => menu.richMenuId === currentIds[purpose]);
      if (
        current &&
        isManagedName(current.name, purpose) &&
        current.name !== wanted[purpose].name &&
        published.some((menu) => menu.richMenuId !== current.richMenuId)
      ) {
        throw new Error(
          `前回の移行が完了していません。適用中の ${current.richMenuId}（${current.name}）と同じ版で再実行してください。`,
        );
      }
    }

    if (hasPublishedOld && !options.assignmentStopped) {
      throw new Error(
        '旧版の移行と削除が必要です。アプリ側の割り当て処理の停止と処理中の要求の完了を確認し、assignment_stopped を有効にして再実行してください。',
      );
    }
    return found;
  }

  /** 管理名が一致するメニューを再利用するか作成し、画像の登録を確認する。 */
  async function prepare(purpose: Purpose, existingId: string | null): Promise<string> {
    const { name, definition, image } = targets[purpose];
    let richMenuId = existingId;
    if (richMenuId) {
      log(`${purpose}: 既存のメニューを再利用します: ${richMenuId}`);
    } else {
      richMenuId = await createMenu({ ...definition, name });
      log(`${purpose}: メニューを用意しました: ${richMenuId}`);
    }
    await ensureImage(richMenuId, image);
    return richMenuId;
  }

  async function createMenu(menu: RichMenuDefinition & { name: string }): Promise<string> {
    try {
      return await api.createRichMenu(menu);
    } catch (error) {
      if (!(error instanceof LineApiError) || !error.isOutcomeUnknown) throw error;
      // 作成できていた場合に二重作成しないよう、一覧で照合する。見つからなくても作り直さない
      let createdId: string | null = null;
      await waitUntil(async () => {
        createdId = findByName(await api.listRichMenus(), menu.name);
        return createdId !== null;
      });
      if (createdId === null) {
        throw new Error(
          `メニュー作成の成否を確認できません。時間をおいて再実行してください。${error.message}`,
          { cause: error },
        );
      }
      return createdId;
    }
  }

  async function ensureImage(richMenuId: string, image: Uint8Array<ArrayBuffer>): Promise<void> {
    let registered = await api.getImage(richMenuId);
    if (registered === null) {
      const uploadError = await attempt(() => api.uploadImage(richMenuId, image));
      await waitUntil(async () => {
        registered = await api.getImage(richMenuId);
        return registered !== null;
      });
      if (registered === null) {
        throw uploadError ?? new Error(`画像の登録を確認できません: ${richMenuId}`);
      }
    }
    if (Buffer.compare(registered, image) !== 0) {
      throw new Error(`登録済みの画像がリポジトリの画像と一致しません: ${richMenuId}`);
    }
  }

  /** 参照先が目的の ID でなければ変更し、反映を確認する。 */
  async function switchTo(
    label: string,
    richMenuId: string,
    read: () => Promise<string | null>,
    write: () => Promise<void>,
  ): Promise<void> {
    if ((await read()) !== richMenuId) {
      const writeError = await attempt(write);
      if (!(await waitUntil(async () => (await read()) === richMenuId))) {
        throw writeError ?? new Error(`${label}の切り替えを確認できません: ${richMenuId}`);
      }
    }
    log(`${label}: ${richMenuId}`);
  }

  /** 一括置換の成功を確認するまで戻らない。確認できなければ例外にして旧版を残す。 */
  async function replaceAssignments(from: string, to: string): Promise<void> {
    const incomplete = (reason: string, cause?: unknown) =>
      new Error(
        `一括置換 ${from} → ${to} を完了できません（${reason}）。旧版は保持しています。同じ版で再実行してください。`,
        { cause },
      );

    const known = options.knownRequests.find((entry) => entry.from === from && entry.to === to);
    if (known) {
      const current = await readPhase(known.requestId);
      const pending = current === 'ongoing' || current === 'unreachable';
      const phase = pending ? await pollPhase(known.requestId) : current;
      if (phase === 'timeout') throw incomplete(`状態を確認できない: ${known.requestId}`);
      if (phase === 'succeeded') {
        log(`一括置換の成功を確認しました: ${from} → ${to}`);
        return;
      }
    }

    for (let count = 1; count <= SEND_ATTEMPTS; count += 1) {
      let requestId: string;
      try {
        requestId = await api.startReplacement(from, to, resumeRequestKey(from, to));
      } catch (error) {
        if (!(error instanceof LineApiError)) throw error;
        if (!error.isOutcomeUnknown || count === SEND_ATTEMPTS) {
          throw incomplete(error.message, error);
        }
        await sleep(CONFIRM_INTERVAL_MS);
        continue;
      }
      log(`一括置換を受け付けました。batch_request_ids: ${from}:${to}:${requestId}`);

      const phase = await pollPhase(requestId);
      if (phase === 'succeeded') {
        log(`一括置換の成功を確認しました: ${from} → ${to}`);
        return;
      }
      if (phase === 'timeout') throw incomplete(`状態を確認できない: ${requestId}`);
    }
    throw incomplete('失敗');
  }

  async function readPhase(
    requestId: string,
  ): Promise<ReplacementPhase | 'unavailable' | 'unreachable'> {
    try {
      return (await api.getReplacementPhase(requestId)) ?? 'unavailable';
    } catch (error) {
      if (error instanceof LineApiError && error.isOutcomeUnknown) return 'unreachable';
      throw error;
    }
  }

  async function pollPhase(requestId: string): Promise<'succeeded' | 'failed' | 'timeout'> {
    for (let count = 0; count < POLL_ATTEMPTS; count += 1) {
      await sleep(POLL_INTERVAL_MS);
      const phase = await readPhase(requestId);
      if (phase === 'succeeded' || phase === 'failed') return phase;
    }
    return 'timeout';
  }

  async function ensureUnreferenced(richMenuId: string): Promise<void> {
    const unreferenced = await waitUntil(async () => {
      if ((await api.getDefaultId()) === richMenuId) return false;
      const aliases = await api.listAliases();
      return aliases.every((alias) => alias.richMenuId !== richMenuId);
    });
    if (!unreferenced) {
      throw new Error(
        `旧版がデフォルトまたはエイリアスから参照されているため削除しません: ${richMenuId}`,
      );
    }
  }

  async function deleteMenu(richMenuId: string): Promise<void> {
    const deleteError = await attempt(() => api.deleteRichMenu(richMenuId));
    if (deleteError) {
      const gone = await waitUntil(async () =>
        (await api.listRichMenus()).every((menu) => menu.richMenuId !== richMenuId),
      );
      if (!gone) throw deleteError;
    }
    log(`旧版を削除しました: ${richMenuId}`);
  }

  async function waitUntil(check: () => Promise<boolean>): Promise<boolean> {
    for (let count = 1; count <= CONFIRM_ATTEMPTS; count += 1) {
      if (await check()) return true;
      if (count < CONFIRM_ATTEMPTS) await sleep(CONFIRM_INTERVAL_MS);
    }
    return false;
  }
}

/** 変更操作を実行し、API の失敗は後続の状態確認で扱えるよう戻り値にする。 */
async function attempt(operation: () => Promise<void>): Promise<LineApiError | null> {
  try {
    await operation();
    return null;
  } catch (error) {
    if (error instanceof LineApiError) return error;
    throw error;
  }
}

function findByName(menus: RichMenuSummary[], name: string): string | null {
  const matches = menus.filter((menu) => menu.name === name);
  if (matches.length > 1) {
    const ids = matches.map((menu) => menu.richMenuId).join(', ');
    throw new Error(`同じ管理名のメニューが複数あります。1 件に整理してください: ${ids}`);
  }
  return matches[0]?.richMenuId ?? null;
}

function oldMenus(
  menus: RichMenuSummary[],
  purpose: Purpose,
  currentName: string,
): RichMenuSummary[] {
  return menus.filter((menu) => isManagedName(menu.name, purpose) && menu.name !== currentName);
}

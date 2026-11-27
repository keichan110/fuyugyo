import { createHash } from 'node:crypto';

/** 連携済み用メニューを指す固定エイリアス。アプリはこのエイリアスから現在の ID を解決する。 */
export const INSTRUCTOR_ALIAS_ID = 'fuyugyo-instructor';

/** 管理するメニューの用途。 */
export const PURPOSES = ['default', 'instructor'] as const;

/** メニューの用途。 */
export type Purpose = (typeof PURPOSES)[number];

/** タップ領域の矩形。 */
export type Bounds = { x: number; y: number; width: number; height: number };

/** タップ時の動作。postback は発言を表示しないため `text`・`displayText` を持たせない。 */
export type Action = { type: 'uri'; uri: string } | { type: 'postback'; data: string };

/** LINE に作成するリッチメニューの定義（管理名を除く）。 */
export type RichMenuDefinition = {
  size: { width: number; height: number };
  selected: boolean;
  chatBarText: string;
  areas: { bounds: Bounds; action: Action }[];
};

/** 用途ごとの画像ファイル名（`assets/` 配下）。 */
export const IMAGE_FILES: Record<Purpose, string> = {
  default: 'default.jpg',
  instructor: 'instructor.jpg',
};

const NAME_PREFIX = 'fuyugyo-richmenu';

/**
 * 環境の値を解決したメニュー定義を組み立てる。
 *
 * postback の `data` は Webhook の受信側との契約のため、変更するときは受信側も合わせる。
 *
 * @param liffUrl 対象環境の LIFF URL
 * @returns 用途ごとの定義
 */
export function buildDefinitions(liffUrl: string): Record<Purpose, RichMenuDefinition> {
  const openApp: Action = { type: 'uri', uri: liffUrl };
  const postback = (data: string): Action => ({ type: 'postback', data });

  return {
    default: {
      size: { width: 2500, height: 843 },
      selected: true,
      chatBarText: 'メニュー',
      areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: openApp }],
    },
    instructor: {
      size: { width: 2500, height: 1686 },
      selected: true,
      chatBarText: 'メニュー',
      areas: [
        { bounds: { x: 0, y: 0, width: 2500, height: 924 }, action: openApp },
        {
          bounds: { x: 0, y: 924, width: 835, height: 762 },
          action: postback('action=team-schedule'),
        },
        {
          bounds: { x: 835, y: 924, width: 830, height: 762 },
          action: postback('action=my-schedule'),
        },
        {
          bounds: { x: 1665, y: 924, width: 835, height: 762 },
          action: postback('action=announcements'),
        },
      ],
    },
  };
}

/**
 * 定義と画像の内容から版を識別する管理名を作る。
 *
 * @param purpose メニューの用途
 * @param definition 環境の値を解決した定義
 * @param image 画像のバイト列
 * @returns `fuyugyo-richmenu:<用途>:<SHA-256>` 形式の名前
 */
export function managedName(
  purpose: Purpose,
  definition: RichMenuDefinition,
  image: Uint8Array,
): string {
  // JSON 文字列は NUL を含まないため、区切りにして定義と画像の境界を一意にする
  const hash = createHash('sha256')
    .update(JSON.stringify(definition))
    .update('\0')
    .update(image)
    .digest('hex');
  return `${NAME_PREFIX}:${purpose}:${hash}`;
}

/**
 * このツールが管理する指定用途のメニュー名かを判定する。
 *
 * 管理対象外のメニューを削除しないよう、形式の完全一致だけを管理対象とする。
 *
 * @param name LINE 上のメニュー名
 * @param purpose メニューの用途
 * @returns 管理対象なら `true`
 */
export function isManagedName(name: string, purpose: Purpose): boolean {
  return new RegExp(`^${NAME_PREFIX}:${purpose}:[0-9a-f]{64}$`).test(name);
}

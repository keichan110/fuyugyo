import { appendFile, readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { IMAGE_FILES } from './definitions.ts';
import { createLineApi } from './line-api.ts';
import { parseKnownRequests, publishRichMenus } from './publish.ts';

/** GitHub Actions から呼び出す入口。設定は環境変数で受け取る。 */
const messages: string[] = [];

function log(message: string): void {
  messages.push(message);
  console.log(message);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}

async function readImage(file: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await readFile(new URL(`./assets/${file}`, import.meta.url)));
}

async function main(): Promise<void> {
  const liffUrl = requireEnv('LINE_LIFF_URL');
  if (!URL.canParse(liffUrl) || new URL(liffUrl).protocol !== 'https:') {
    throw new Error('LINE_LIFF_URL は https の URL にしてください');
  }

  const result = await publishRichMenus({
    api: createLineApi({
      accessToken: requireEnv('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN'),
      fetch,
    }),
    officialAccountId: requireEnv('LINE_OFFICIAL_ACCOUNT_ID'),
    liffUrl,
    images: {
      default: await readImage(IMAGE_FILES.default),
      instructor: await readImage(IMAGE_FILES.instructor),
    },
    assignmentStopped: process.env.LINE_ASSIGNMENT_STOPPED === 'true',
    knownRequests: parseKnownRequests(process.env.LINE_BATCH_REQUEST_IDS ?? ''),
    sleep: (milliseconds) => sleep(milliseconds),
    log,
  });

  log(`公開が完了しました。default=${result.menuIds.default}`);
  log(`instructor=${result.menuIds.instructor}`);
  log(`削除した旧版: ${result.deletedIds.join(', ') || 'なし'}`);
  log(`保持した旧版: ${result.retainedIds.join(', ') || 'なし'}`);
}

/** 実行結果を GitHub Actions の実行画面に残す。 */
async function writeSummary(succeeded: boolean): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const lines = [
    `## LINE リッチメニュー公開: ${succeeded ? '成功' : '失敗'}`,
    `- 対象環境: ${process.env.TARGET_ENVIRONMENT ?? '未指定'}`,
    ...messages.map((message) => `- ${message}`),
    '',
    '復旧手順: `docs/settings/line-rich-menu.md`',
  ];
  await appendFile(path, `${lines.join('\n')}\n`);
}

try {
  await main();
  await writeSummary(true);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(message);
  // ワークフローコマンドが途中で切れないよう、改行などをエスケープする
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.log(`::error::${escaped}`);
  await writeSummary(false);
  process.exitCode = 1;
}

/**
 * PDF生成ヘルパー関数
 *
 * @description
 * HTMLからPDFを生成する。
 * 現在はMVP実装として、HTMLをそのまま返す（ブラウザの印刷機能を使用）。
 * 将来的にはCloudflare Browser Rendering APIを使用してサーバーサイドでPDF生成を行う。
 *
 * @todo Cloudflare Browser Rendering APIの実装
 * @see https://developers.cloudflare.com/browser-rendering/how-to/pdf-generation/
 */

/**
 * HTMLからPDFを生成
 *
 * @remarks
 * MVP実装: HTMLをそのまま返す。
 * ブラウザで開いた際に、ユーザーが印刷機能（Ctrl+P / Cmd+P）を使用してPDF保存できる。
 *
 * 将来の実装:
 * - Cloudflare Browser Rendering APIを使用
 * - Puppeteer/Playwrightでサーバーサイド生成
 *
 * @param html - PDF化するHTML文字列
 * @returns HTMLバイナリ（将来的にはPDFバイナリ）
 */
export function generatePDF(html: string): Uint8Array {
  // MVP実装: HTMLをそのまま返す
  // ブラウザで開いてユーザーがPDF印刷できる
  const encoder = new TextEncoder();
  return encoder.encode(html);
}

/**
 * PDF生成が利用可能かチェック
 *
 * @returns 現在は常にtrue（HTML返却のみ）
 */
export function isPDFGenerationAvailable(): boolean {
  // MVP実装では常にtrue
  // 将来的にはCloudflare Browser Rendering APIの可用性をチェック
  return true;
}

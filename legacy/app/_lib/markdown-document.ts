/**
 * サイト内の静的Markdown文書を表現する共通モデル
 */
export type MarkdownDocument = {
  /** 文書タイトル */
  readonly title: string;
  /** メタデータ（制定日や最終更新日などの補足情報） */
  readonly metadata: Record<string, string>;
  /** Markdownフォーマットの本文 */
  readonly content: string;
};

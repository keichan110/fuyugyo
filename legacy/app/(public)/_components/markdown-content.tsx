// 正規表現パターンをトップレベルで定義（パフォーマンス最適化）
const NUMBERED_LIST_PATTERN = /^\d+\.\s/;
const BULLET_LIST_PATTERN = /^\s+-\s/;

// キー生成用の定数
const KEY_CONTENT_PREVIEW_LENGTH = 30;

type MarkdownContentProps = {
  content: string;
  metadata?: Record<string, string>;
};

export function MarkdownContent({ content, metadata }: MarkdownContentProps) {
  // Markdownを簡易的にHTMLに変換
  const formatContent = (text: string) => {
    return text
      .split("\n")
      .map((line, index) => {
        // 各行のユニークなkeyを生成（行番号 + 内容の最初のN文字）
        const uniqueKey = `line-${index}-${line.slice(0, KEY_CONTENT_PREVIEW_LENGTH)}`;

        // h1要素はスキップ（タイトルとして別途処理される）
        if (line.startsWith("# ")) {
          return null;
        }

        // 見出し
        if (line.startsWith("## ")) {
          return (
            <h2 className="mb-3 font-semibold text-xl" key={uniqueKey}>
              {line.replace("## ", "")}
            </h2>
          );
        }

        // リスト項目
        if (line.match(NUMBERED_LIST_PATTERN)) {
          return (
            <li className="ml-4" key={uniqueKey}>
              {line.replace(NUMBERED_LIST_PATTERN, "")}
            </li>
          );
        }

        // サブリスト項目
        if (line.match(BULLET_LIST_PATTERN)) {
          return (
            <li className="ml-8 list-disc" key={uniqueKey}>
              {line.replace(BULLET_LIST_PATTERN, "")}
            </li>
          );
        }

        // 空行
        if (line.trim() === "") {
          return <br key={uniqueKey} />;
        }

        // 通常のテキスト
        return (
          <p className="mb-2" key={uniqueKey}>
            {line}
          </p>
        );
      })
      .filter(Boolean);
  };

  return (
    <div className="space-y-6">
      <div className="prose prose-slate dark:prose-invert max-w-none">
        {formatContent(content)}
      </div>

      {metadata && Object.keys(metadata).length > 0 && (
        <footer className="mt-8 border-border border-t pt-8">
          <div className="text-center text-muted-foreground text-sm">
            {Object.entries(metadata).map(([key, value], index) => (
              <div key={key}>
                <strong>{key}</strong>: {value}
                {index < Object.entries(metadata).length - 1 && <br />}
              </div>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}

import type { MarkdownDocument } from "@/app/_lib/markdown-document";
import { MarkdownContent } from "@/app/(public)/_components/markdown-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DocumentPageProps = {
  document: MarkdownDocument;
};

/**
 * 法務ドキュメント（利用規約、プライバシーポリシーなど）の表示コンポーネント
 * Server Component として実装され、Card + MarkdownContent の共通UIを提供
 */
export function DocumentPage({ document }: DocumentPageProps) {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-center font-bold text-3xl">
            {document.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownContent
            content={document.content}
            metadata={document.metadata}
          />
        </CardContent>
      </Card>
    </div>
  );
}

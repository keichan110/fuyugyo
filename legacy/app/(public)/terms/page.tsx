import { DocumentPage } from "@/app/(public)/_components/document-page";
import { termsDocument } from "./_lib/terms";

export default function TermsPage() {
  return <DocumentPage document={termsDocument} />;
}

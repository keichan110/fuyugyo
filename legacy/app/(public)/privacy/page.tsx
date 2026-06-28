import { DocumentPage } from "@/app/(public)/_components/document-page";
import { privacyDocument } from "./_lib/privacy";

export default function PrivacyPage() {
  return <DocumentPage document={privacyDocument} />;
}

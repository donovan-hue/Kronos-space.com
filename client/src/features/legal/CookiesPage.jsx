import LegalDocumentPage from "./LegalDocumentPage";
import { legalDoc } from "./legalDocuments";

/** Cookies y almacenamiento local. Ruta pública: se lee sin sesión. */
export default function CookiesPage() {
  return <LegalDocumentPage doc={legalDoc("cookies")} />;
}

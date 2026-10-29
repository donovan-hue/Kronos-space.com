import LegalDocumentPage from "./LegalDocumentPage";
import { legalDoc } from "./legalDocuments";

/** Términos del servicio. Ruta pública: se lee sin sesión. */
export default function TerminosPage() {
  return <LegalDocumentPage doc={legalDoc("terminos")} />;
}

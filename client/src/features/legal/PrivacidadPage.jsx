import LegalDocumentPage from "./LegalDocumentPage";
import { legalDoc } from "./legalDocuments";

/** Aviso de privacidad. Ruta pública: se lee sin sesión. */
export default function PrivacidadPage() {
  return <LegalDocumentPage doc={legalDoc("privacidad")} />;
}

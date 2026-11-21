import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getAuthConfig, isValidSessionToken } from "../../lib/auth";
import { getFixedChunkConfig, listDocuments } from "../../lib/knowledge";
import ThemePicker from "../theme-picker";
import UploadForm from "./upload-form";

// Lekcja 6, W2: wklejanie dokumentów do bazy wiedzy + lista dokumentów. Bez sesji – powrót do logowania.
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!config || !isValidSessionToken(token, config)) redirect("/");

  // Lista dokumentów – dopiero po sprawdzeniu sesji.
  const documents = await listDocuments();

  return (
    <main className="chat history upload">
      <header className="chat-header">
        <div className="header-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">📚</span>
            <div>
              <h1>Baza wiedzy</h1>
              <p className="tagline">Wklej dokument (np. cennik, FAQ). Każdy akapit stanie się osobnym fragmentem.</p>
            </div>
          </div>
          <div className="header-actions">
            <Link href="/" className="nav-link">
              ← Czat
            </Link>
            <ThemePicker />
          </div>
        </div>
      </header>

      <UploadForm
        initialDocuments={documents.ok ? documents.value : []}
        initialListError={documents.ok ? null : documents.error}
        fixedChunk={getFixedChunkConfig()}
      />
    </main>
  );
}

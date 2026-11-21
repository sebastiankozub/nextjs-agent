import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getAuthConfig, isValidSessionToken } from "../../lib/auth";
import { getProfile } from "../../lib/profile";
import ThemePicker from "../theme-picker";
import ProfileEditor from "./profile-editor";

// Lekcja 5, W3 (Standard): to, co agent wie o użytkowniku – do poprawienia albo usunięcia.
// Najpierw sesja: bez niej powrót do logowania, a baza nie jest nawet pytana.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!config || !isValidSessionToken(token, config)) redirect("/");

  const result = await getProfile();

  return (
    <main className="chat history profile">
      <header className="chat-header">
        <div className="header-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">🧠</span>
            <div>
              <h1>Profil</h1>
              <p className="tagline">To, co asystent Studio Nova o Tobie pamięta. Popraw albo usuń, co chcesz.</p>
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

      {result.ok ? (
        <ProfileEditor initial={result.value} />
      ) : (
        <p className="msg-error" role="alert">
          ⚠️ {result.error}
        </p>
      )}
    </main>
  );
}

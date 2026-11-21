import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getAuthConfig, isValidSessionToken } from "../../lib/auth";
import { listConversations } from "../../lib/conversations";
import ThemePicker from "../theme-picker";
import DeleteConversationButton from "./delete-button";

// Lekcja 5, W2 (Standard): lista zapisanych rozmów – jak pasek boczny w ChatGPT.
// Najpierw sesja: bez niej powrót do logowania, a baza nie jest nawet pytana.
export const dynamic = "force-dynamic";

function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "medium", timeStyle: "short" });

export default async function HistoryPage() {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!config || !isValidSessionToken(token, config)) redirect("/");

  const result = await listConversations();

  return (
    <main className="chat history">
      <header className="chat-header">
        <div className="header-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">🗂</span>
            <div>
              <h1>Historia rozmów</h1>
              <p className="tagline">Zapisane rozmowy ze Studio Nova – najnowsze na górze. Kliknij, żeby wrócić do rozmowy.</p>
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

      <div className="chat-toolbar">
        <Link href="/?nowa=1" className="nav-link">
          ＋ Nowa rozmowa
        </Link>
      </div>

      {!result.ok ? (
        <p className="msg-error" role="alert">
          ⚠️ {result.error}
        </p>
      ) : result.value.length === 0 ? (
        // Zachęta głosem Studio Nova (uprzejmie, forma Pan/Pani, konkretnie).
        <div className="history-empty">
          <p>
            Dzień dobry! Tu jeszcze pusto – nie ma żadnej zapisanej rozmowy. Chętnie pomogę przygotować
            pierwszy szkic odpowiedzi dla klienta: wystarczy wkleić jego wiadomość albo zapytać na przykład
            o cenę konsultacji online.
          </p>
          <Link href="/?nowa=1" className="nav-link">
            Zacznij pierwszą rozmowę
          </Link>
        </div>
      ) : (
        <ul className="history-list">
          {result.value.map((c) => (
            <li key={c.id} className="history-row">
              <Link href={`/?rozmowa=${c.id}`} className="history-item">
                <span className="history-title">{c.title}</span>
                <span className="history-meta">
                  {formatDate(c.createdAt)} · {c.messageCount}{" "}
                  {plural(c.messageCount, "wiadomość", "wiadomości", "wiadomości")}
                </span>
              </Link>
              <DeleteConversationButton id={c.id} title={c.title} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

import { cookies } from "next/headers";
import type { UIMessage } from "ai";
import { SESSION_COOKIE, getAuthConfig, isValidSessionToken, signReply } from "../lib/auth";
import { loadConversation, parseConversationId } from "../lib/conversations";
import Chat from "./chat";
import ThemePicker from "./theme-picker";
import { showErrorDetails } from "../lib/openrouter-config";

const ERRORS: Record<string, string> = {
  haslo: "Nieprawidłowe hasło.",
  limit: "Za dużo nieudanych prób. Spróbuj ponownie za 15 minut.",
  konfiguracja: "Logowanie jest wyłączone: brak konfiguracji serwera.",
};

export default async function Home({
  searchParams,
}: {
  // rozmowa=<numer> – otwiera rozmowę z /history; nowa=1 – pusta rozmowa (przycisk na /history).
  searchParams: Promise<{ blad?: string; rozmowa?: string; nowa?: string }>;
}) {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const params = await searchParams;

  if (config && isValidSessionToken(token, config)) {
    // Rozmowa z bazy (lekcja 5, W2) – czytana dopiero PO sprawdzeniu sesji:
    // wskazana w adresie (?rozmowa=…), pusta (?nowa=1) albo najnowsza.
    const fresh = params.nowa === "1";
    const requestedId = parseConversationId(params.rozmowa);
    const loaded = fresh ? null : await loadConversation(requestedId);
    const conversation = loaded?.ok ? loaded.value : null;
    const dbError =
      loaded && !loaded.ok
        ? loaded.error
        : requestedId !== null && !conversation
          ? `Nie znaleziono rozmowy nr ${requestedId}. Następna wiadomość zacznie nową rozmowę.`
          : null;
    const initialMessages: UIMessage[] = (conversation?.messages ?? []).map((m) => ({
      id: `db-${m.id}`,
      role: m.role,
      parts: [{ type: "text", text: m.content }],
      // Odpowiedź z naszej bazy podpisuje serwer – przy kolejnym pytaniu trafi do kontekstu modelu.
      ...(m.role === "assistant" ? { metadata: { replySig: signReply(m.content, config) } } : {}),
    }));
    // Tylko nazwa modelu trafia do przeglądarki — klucz API zostaje na serwerze.
    return (
      <Chat
        // Inna rozmowa = nowy czat (useChat bierze wiadomości startowe tylko przy pierwszym renderze).
        key={fresh ? "nowa" : `rozmowa-${conversation?.id ?? "brak"}`}
        modelId={process.env.OPENROUTER_MODEL ?? null}
        initialConversationId={conversation?.id ?? null}
        initialMessages={initialMessages}
        dbError={dbError}
      />
    );
  }

  const { blad } = params;
  const error = blad ? ERRORS[blad] : undefined;

  return (
    <main className="login">
      <div className="login-card">
      <div className="login-top">
        <ThemePicker />
      </div>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">✦</span>
        <div>
          <h1>Studio Nova</h1>
          <p className="tagline">Asystent obsługi klientów. Wpisz hasło, aby wejść.</p>
        </div>
      </div>
      {!config ? (
        <p className="error" role="alert">
          {showErrorDetails()
            ? "Brak konfiguracji: ustaw CHAT_PASSWORD i SESSION_SECRET (min. 32 znaki) w .env.local, a potem uruchom ponownie serwer."
            : "Aplikacja nie jest jeszcze skonfigurowana. Spróbuj później."}
        </p>
      ) : (
        <form className="composer" action="/api/login" method="post">
          <input
            type="password"
            name="password"
            placeholder="Hasło warsztatowe"
            required
            autoFocus
            autoComplete="current-password"
          />
          <button type="submit">Wejdź</button>
        </form>
      )}
      {config && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      </div>
    </main>
  );
}

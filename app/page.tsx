import { cookies } from "next/headers";
import { SESSION_COOKIE, getAuthConfig, isValidSessionToken } from "../lib/auth";
import Chat from "./chat";

const ERRORS: Record<string, string> = {
  haslo: "Nieprawidłowe hasło.",
  limit: "Za dużo nieudanych prób. Spróbuj ponownie za 15 minut.",
  konfiguracja: "Logowanie jest wyłączone: brak konfiguracji serwera.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ blad?: string }>;
}) {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (config && isValidSessionToken(token, config)) {
    return <Chat />;
  }

  const { blad } = await searchParams;
  const error = blad ? ERRORS[blad] : undefined;

  return (
    <main className="login">
      <h1>Wpisz hasło</h1>
      {!config ? (
        <p className="error" role="alert">
          Brak konfiguracji: ustaw CHAT_PASSWORD i SESSION_SECRET (min. 32
          znaki) w .env.local, a potem uruchom ponownie serwer.
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
    </main>
  );
}

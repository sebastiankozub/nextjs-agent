import { handleAnalyze } from "../../../lib/agent-analyze";
import { handleChat } from "../../../lib/agent-chat";
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";

// Jeden endpoint agenta (lekcja 3, W3):
// - mode "chat":    narzędzia (w tym generowanie obrazu), streaming postępu, odpowiedź po walidacji Zod,
//                   do użytkownika tylko treść odpowiedzi,
// - mode "analyze": wynik ustrukturyzowany JSON (analiza wiadomości albo zdjęcia dokumentu).
export const maxDuration = 90;

export async function POST(req: Request) {
  // 1. Sesja – bez niej żaden model nie jest wywoływany.
  const authConfig = getAuthConfig();
  if (!authConfig || !isValidSessionToken(readSessionCookie(req), authConfig)) {
    return Response.json(
      { ok: false, kind: "auth", message: "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, kind: "input", message: "Nieprawidłowe zapytanie." }, { status: 400 });
  }

  const mode = (body as { mode?: unknown } | null)?.mode;
  if (mode === "chat") return handleChat(body, authConfig);
  if (mode === "analyze") return handleAnalyze(body);
  return Response.json(
    { ok: false, kind: "input", message: 'Nieznany tryb. Dozwolone: "chat" albo "analyze".' },
    { status: 400 },
  );
}

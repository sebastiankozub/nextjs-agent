import {
  getAuthConfig,
  isValidSessionToken,
  readSessionCookie,
} from "../../../lib/auth";
import { buildAnalysisPrompt, buildChatReply, parseAnalyzeRequest } from "../../../lib/analysis";
import { runAnalysis } from "../../../lib/analysis-run";
import { ANALYSIS_INSTRUCTIONS } from "../../../lib/instructions";

export const maxDuration = 30;

function fail(kind: string, message: string, status: number) {
  return Response.json({ ok: false, kind, message }, { status });
}

export async function POST(req: Request) {
  // 1. Sesja — bez niej model nie jest wywoływany.
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return fail(
      "auth",
      "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się.",
      401,
    );
  }

  // 2. Klucz i model tylko z serwera.
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL;
  if (!apiKey || !modelId) {
    return fail(
      "config",
      "Brak konfiguracji OPENROUTER_API_KEY lub OPENROUTER_MODEL w .env.local.",
      500,
    );
  }

  // 3. Wejście: tylko tekst wiadomości. Przeglądarka nie wysyła instrukcji ani opcji.
  // Inne pola z przeglądarki (send_now, role, instructions…) są ignorowane.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("input", "Nieprawidłowe zapytanie.", 400);
  }
  const input = parseAnalyzeRequest(body);
  if (!input.ok) {
    return fail("input", input.message, 400);
  }

  // 4. Wspólna ścieżka analizy (lib/analysis-run.ts): structured output + walidacja.
  // Znaczniki <<< >>> w tekście klienta są neutralizowane (W3).
  const { status, ...outcome } = await runAnalysis({
    apiKey,
    modelId,
    instructions: ANALYSIS_INSTRUCTIONS,
    prompt: buildAnalysisPrompt(input.message),
    logTag: "api/analyze",
  });
  // Tekst odpowiedzi budowany wspólnym kodem – tym samym co w czacie.
  if (outcome.ok && "analysis" in outcome) {
    return Response.json({ ...outcome, reply: buildChatReply(outcome.analysis) }, { status });
  }
  return Response.json(outcome, { status });
}

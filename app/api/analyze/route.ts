import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";
import {
  getAuthConfig,
  isValidSessionToken,
  readSessionCookie,
} from "../../../lib/auth";
import {
  analysisSchema,
  buildAnalysisPrompt,
  interpretModelOutput,
  parseAnalyzeRequest,
  type AnalysisOutcome,
} from "../../../lib/analysis";
import { ANALYSIS_INSTRUCTIONS } from "../../../lib/instructions";

export const maxDuration = 30;

function json(body: AnalysisOutcome | { ok: false; kind: string; message: string }, status: number) {
  return Response.json(body, { status });
}

function fail(kind: string, message: string, status: number) {
  return json({ ok: false, kind, message }, status);
}

function describeProviderError(error: APICallError) {
  const body = (error.responseBody ?? "").toLowerCase();
  // OpenRouter z require_parameters: brak dostawcy obsługującego structured output.
  if (
    error.statusCode === 404 &&
    (body.includes("no endpoints") || body.includes("parameter"))
  ) {
    return fail(
      "unsupported",
      "Ustawiony model (OPENROUTER_MODEL) nie obsługuje structured output (response_format / json_schema) u żadnego dostawcy w OpenRouter. " +
        "Wybierz w .env.local model, który na openrouter.ai ma w 'Supported parameters' pozycję structured_outputs, i uruchom ponownie serwer. " +
        "Zwykły czat działa dalej bez zmian.",
      422,
    );
  }
  switch (error.statusCode) {
    case 400:
      return fail(
        "unsupported",
        "Dostawca odrzucił zapytanie z JSON Schema (możliwy brak obsługi structured output w tym modelu). Szczegóły są w terminalu serwera.",
        422,
      );
    case 401:
      return fail("provider", "OpenRouter odrzucił klucz API. Sprawdź OPENROUTER_API_KEY w .env.local.", 502);
    case 402:
      return fail("provider", "Brak środków na koncie OpenRouter dla tego modelu.", 502);
    case 429:
      return fail("provider", "Za dużo zapytań. Odczekaj chwilę i spróbuj ponownie.", 429);
    default:
      return fail("provider", "Błąd dostawcy modelu. Szczegóły są w terminalu serwera.", 502);
  }
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
  const message = input.message;

  const openrouter = createOpenRouter({ apiKey });
  // require_parameters: OpenRouter kieruje zapytanie tylko do dostawców,
  // którzy obsługują response_format — inaczej zwraca błąd zamiast go ignorować.
  const model = openrouter.chat(modelId, {
    provider: { require_parameters: true },
  });

  try {
    const result = await generateText({
      model,
      instructions: ANALYSIS_INSTRUCTIONS,
      // Wiadomość klienta to wyłącznie dane do analizy.
      // Znaczniki <<< >>> w tekście klienta są neutralizowane (W3).
      prompt: buildAnalysisPrompt(message),
      output: Output.object({
        name: "studio_nova_analysis",
        description: "Analiza wiadomości klienta Studio Nova",
        schema: analysisSchema,
      }),
      maxOutputTokens: 800,
    });

    // Własna walidacja na serwerze — niezależnie od tego, co sprawdził SDK.
    const outcome = interpretModelOutput({
      finishReason: result.finishReason,
      text: result.text,
    });
    return json(outcome, outcome.ok ? 200 : 502);
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      // SDK nie dostał poprawnego obiektu — ustalamy dokładny powód.
      const outcome = interpretModelOutput({
        finishReason: error.finishReason,
        text: error.text,
      });
      console.error("[api/analyze] NoObjectGeneratedError", error.finishReason, error.cause);
      return json(outcome, 502);
    }
    if (NoOutputGeneratedError.isInstance(error)) {
      return fail("incomplete", "Model nie zwrócił wyniku analizy.", 502);
    }
    if (APICallError.isInstance(error)) {
      console.error("[api/analyze]", error.statusCode, error.responseBody);
      return describeProviderError(error);
    }
    console.error("[api/analyze]", error);
    return fail("provider", "Nie udało się uzyskać analizy. Szczegóły są w terminalu serwera.", 502);
  }
}

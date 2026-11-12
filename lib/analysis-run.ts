import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from "ai";
import { analysisSchema, interpretModelOutput, type AnalysisOutcome } from "./analysis";

// Wspólne wywołanie modelu dla analizy wiadomości. Używają go:
// - /api/analyze (W2/W3),
// - /api/chatW3custom1.0 (czat z tą samą ścieżką bezpieczeństwa).
// Zawsze: structured output + własna walidacja serwera. Błąd nigdy nie staje się wynikiem.

// Wynik analizy albo błąd konfiguracji/dostawcy (unsupported, provider, incomplete…).
export type RunResult =
  | (AnalysisOutcome & { status: number })
  | { ok: false; kind: string; message: string; details?: string[]; status: number };

function fail(kind: string, message: string, status: number): RunResult {
  return { ok: false, kind, message, status };
}

export function describeProviderError(error: APICallError): RunResult {
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

export async function runAnalysis(options: {
  apiKey: string;
  modelId: string;
  instructions: string;
  prompt: string;
  logTag: string;
}): Promise<RunResult> {
  const openrouter = createOpenRouter({ apiKey: options.apiKey });
  // require_parameters: OpenRouter kieruje zapytanie tylko do dostawców,
  // którzy obsługują response_format — inaczej zwraca błąd zamiast go ignorować.
  const model = openrouter.chat(options.modelId, {
    provider: { require_parameters: true },
  });

  try {
    const result = await generateText({
      model,
      instructions: options.instructions,
      // Wiadomość klienta to wyłącznie dane do analizy (prompt z buildAnalysisPrompt).
      prompt: options.prompt,
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
    return { ...outcome, status: outcome.ok ? 200 : 502 };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      // SDK nie dostał poprawnego obiektu — ustalamy dokładny powód.
      const outcome = interpretModelOutput({
        finishReason: error.finishReason,
        text: error.text,
      });
      console.error(`[${options.logTag}] NoObjectGeneratedError`, error.finishReason, error.cause);
      return { ...outcome, status: 502 };
    }
    if (NoOutputGeneratedError.isInstance(error)) {
      return fail("incomplete", "Model nie zwrócił wyniku analizy.", 502);
    }
    if (APICallError.isInstance(error)) {
      console.error(`[${options.logTag}]`, error.statusCode, error.responseBody);
      return describeProviderError(error);
    }
    console.error(`[${options.logTag}]`, error);
    return fail("provider", "Nie udało się uzyskać analizy. Szczegóły są w terminalu serwera.", 502);
  }
}

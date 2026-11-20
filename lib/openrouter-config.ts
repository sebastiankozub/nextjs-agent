import { APICallError } from "ai";

// Wspólna konfiguracja OpenRouter i komunikaty błędów dostawcy (czat, analiza, obrazy).
// Wartości kluczy NIGDY nie trafiają do komunikatów ani logów – tylko wskazówki co do formatu.

const WHERE =
  "lokalnie: plik .env.local i restart serwera; na Vercelu: Settings → Environment Variables (środowisko Production) i ponowne wdrożenie";

export type OpenRouterConfig =
  | { ok: true; apiKey: string; modelId: string }
  | { ok: false; message: string };

/** Sprawdza OPENROUTER_API_KEY i OPENROUTER_MODEL; wykrywa typowe błędy wklejenia (cudzysłowy, spacje). */
export function getOpenRouterConfig(): OpenRouterConfig {
  const rawKey = process.env.OPENROUTER_API_KEY ?? "";
  const rawModel = process.env.OPENROUTER_MODEL ?? "";
  const problems: string[] = [];

  if (!rawKey) problems.push("brak OPENROUTER_API_KEY");
  else {
    if (rawKey !== rawKey.trim()) problems.push("OPENROUTER_API_KEY ma spacje lub nową linię na początku/końcu");
    if (/^["']|["']$/.test(rawKey.trim())) problems.push("OPENROUTER_API_KEY jest w cudzysłowie – wklej sam klucz");
    else if (!rawKey.trim().startsWith("sk-or-")) problems.push("OPENROUTER_API_KEY nie wygląda na klucz OpenRouter (powinien zaczynać się od sk-or-)");
  }
  if (!rawModel) problems.push("brak OPENROUTER_MODEL");
  else if (rawModel !== rawModel.trim()) problems.push("OPENROUTER_MODEL ma spacje na początku/końcu");

  if (problems.length > 0) {
    return { ok: false, message: `Błąd konfiguracji: ${problems.join("; ")}. Popraw (${WHERE}).` };
  }
  return { ok: true, apiKey: rawKey.trim(), modelId: rawModel.trim() };
}

/** Krótka treść błędu od OpenRoutera (bez danych wrażliwych), np. „User not found”. */
function providerDetail(error: APICallError): string {
  let detail = "";
  try {
    const body = JSON.parse(error.responseBody ?? "");
    detail = body?.error?.message ?? "";
  } catch {
    detail = "";
  }
  detail = (detail || error.message || "").replace(/sk-or-[\w-]+/g, "sk-or-…").trim();
  return detail ? ` Odpowiedź OpenRouter: „${detail.slice(0, 160)}”.` : "";
}

/**
 * Zrozumiały komunikat błędu dostawcy.
 * @param what  czego dotyczyło wywołanie, np. "czat", "generowanie obrazu"
 * @param model identyfikator modelu użytego w wywołaniu
 * @param modelVar nazwa zmiennej, z której pochodzi model
 */
export function describeProviderError(
  error: unknown,
  what: string,
  model: string,
  modelVar = "OPENROUTER_MODEL",
): string {
  if (APICallError.isInstance(error)) {
    const detail = providerDetail(error);
    switch (error.statusCode) {
      case 401:
        return `OpenRouter odrzucił klucz API (${what}, HTTP 401).${detail} Sprawdź OPENROUTER_API_KEY (${WHERE}).`;
      case 402:
        return `Brak środków na koncie OpenRouter dla modelu ${model} (${what}, HTTP 402).${detail}`;
      case 403:
        return `Brak dostępu do modelu ${model} (${what}, HTTP 403).${detail} Sprawdź ${modelVar} albo uprawnienia klucza.`;
      case 404:
        if (/image/i.test(error.message)) {
          return `Model ${model} nie obsługuje zdjęć (${what}). Ustaw w ${modelVar} model z Vision, np. google/gemini-3.8-flash.`;
        }
        return `OpenRouter nie zna modelu ${model} albo żaden dostawca go nie obsługuje (${what}, HTTP 404).${detail} Sprawdź ${modelVar}.`;
      case 429:
        return `Za dużo zapytań do OpenRouter (${what}, HTTP 429). Odczekaj chwilę i spróbuj ponownie.`;
      default:
        return `Błąd dostawcy modelu ${model} (${what}, HTTP ${error.statusCode ?? "?"}).${detail}`;
    }
  }
  return `Nie udało się wykonać: ${what}. Szczegóły są w logach serwera.`;
}

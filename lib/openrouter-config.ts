import { APICallError } from "ai";

// Wspólna konfiguracja OpenRouter i komunikaty błędów dostawcy (czat, analiza, obrazy).
// Wartości kluczy NIGDY nie trafiają do komunikatów ani logów – tylko wskazówki co do formatu.
//
// Szczegóły (nazwy zmiennych, pliki konfiguracji, kody HTTP, odpowiedź dostawcy) widzi użytkownik
// TYLKO w trybie deweloperskim (npm run dev) albo przy SHOW_ERROR_DETAILS=true.
// Na produkcji użytkownik dostaje ogólny komunikat z kodem i numerem zgłoszenia,
// a pełny opis trafia do logów serwera (na Vercelu: zakładka Logs) pod tym samym numerem.

export function showErrorDetails(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SHOW_ERROR_DETAILS === "true";
}

/** Komunikat dla użytkownika: szczegóły w dev, ogólny z kodem i numerem zgłoszenia na produkcji. */
export function publicMessage(detail: string, code: string, generic = "Usługa jest chwilowo niedostępna. Spróbuj ponownie później."): string {
  if (showErrorDetails()) return detail;
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[błąd ${code} ref ${ref}] ${detail}`);
  return `${generic} (kod: ${code}, zgłoszenie: ${ref})`;
}

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
    return {
      ok: false,
      message: publicMessage(`Błąd konfiguracji: ${problems.join("; ")}. Popraw (${WHERE}).`, "CONFIG"),
    };
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
  const [detailMessage, code] = describeDetailed(error, what, model, modelVar);
  // Limit zapytań to informacja przydatna dla użytkownika – bez szczegółów technicznych.
  if (code === "RATE_LIMIT") return "Za dużo zapytań. Odczekaj chwilę i spróbuj ponownie.";
  return publicMessage(detailMessage, code);
}

function describeDetailed(error: unknown, what: string, model: string, modelVar: string): [string, string] {
  if (APICallError.isInstance(error)) {
    const detail = providerDetail(error);
    switch (error.statusCode) {
      case 401:
        return [`OpenRouter odrzucił klucz API (${what}, HTTP 401).${detail} Sprawdź OPENROUTER_API_KEY (${WHERE}).`, "AUTH"];
      case 402:
        return [`Brak środków na koncie OpenRouter dla modelu ${model} (${what}, HTTP 402).${detail}`, "CREDITS"];
      case 403:
        return [`Brak dostępu do modelu ${model} (${what}, HTTP 403).${detail} Sprawdź ${modelVar} albo uprawnienia klucza.`, "FORBIDDEN"];
      case 404:
        if (/image/i.test(error.message)) {
          return [`Model ${model} nie obsługuje zdjęć (${what}). Ustaw w ${modelVar} model z Vision, np. google/gemini-3.8-flash.`, "NO_VISION"];
        }
        return [`OpenRouter nie zna modelu ${model} albo żaden dostawca go nie obsługuje (${what}, HTTP 404).${detail} Sprawdź ${modelVar}.`, "MODEL"];
      case 429:
        return [`Za dużo zapytań do OpenRouter (${what}, HTTP 429).`, "RATE_LIMIT"];
      default:
        return [`Błąd dostawcy modelu ${model} (${what}, HTTP ${error.statusCode ?? "?"}).${detail}`, "PROVIDER"];
    }
  }
  return [`Nie udało się wykonać: ${what}. ${error instanceof Error ? error.message : ""}`.trim(), "UNKNOWN"];
}

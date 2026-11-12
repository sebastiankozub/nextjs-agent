import { z } from "zod";

// Schemat wyniku analizy (W2). strictObject = dodatkowe pola są odrzucane
// (odpowiednik "additionalProperties": false).
export const analysisSchema = z.strictObject({
  category: z
    .enum(["sales", "support", "billing", "unknown"])
    .describe(
      "sales = oferta i cena; support = problem techniczny; billing = płatność lub zwrot; unknown = brak rozpoznanej sprawy",
    ),
  priority: z
    .enum(["normal", "high"])
    .describe(
      "high = blokada opłaconego spotkania zaczynającego się w ciągu godziny; inaczej normal",
    ),
  draft: z.string().describe("Szkic odpowiedzi do klienta po polsku"),
  needs_review: z
    .boolean()
    .describe("true przy braku danych lub konieczności decyzji pracownika"),
});

export type Analysis = z.infer<typeof analysisSchema>;

export type AnalysisErrorKind =
  | "invalid_schema" // brak pola, zły typ, niedozwolona wartość, dodatkowe pole
  | "not_json" // model odpowiedział tekstem zamiast JSON (np. odmowa)
  | "refused" // dostawca zablokował treść (content-filter)
  | "truncated" // odpowiedź ucięta (limit tokenów)
  | "incomplete"; // inny powód zakończenia niż "stop"

export type AnalysisOutcome =
  | { ok: true; analysis: Analysis }
  | { ok: false; kind: AnalysisErrorKind; message: string; details?: string[] };

export function describeIssue(issue: z.core.$ZodIssue): string {
  const field = issue.path.length > 0 ? issue.path.join(".") : "(obiekt)";
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined
        ? `Brak wymaganego pola "${field}".`
        : `Pole "${field}" ma zły typ (oczekiwano: ${issue.expected}).`;
    case "invalid_value":
      return `Pole "${field}" ma niedozwoloną wartość ${JSON.stringify(issue.input)} (dozwolone: ${issue.values.join(", ")}).`;
    case "unrecognized_keys":
      return `Niedozwolone dodatkowe pole: ${issue.keys.map((k) => `"${k}"`).join(", ")}.`;
    default:
      return `Pole "${field}": ${issue.message}`;
  }
}

/** Sprawdza gotowy obiekt (już sparsowany JSON) względem schematu. */
export function validateAnalysis(value: unknown): AnalysisOutcome {
  // reportInput: Zod 4 dołącza do błędu wartość, która go spowodowała.
  const parsed = analysisSchema.safeParse(value, { reportInput: true });
  if (parsed.success) return { ok: true, analysis: parsed.data };
  return {
    ok: false,
    kind: "invalid_schema",
    message: "Wynik modelu nie jest zgodny ze schematem analizy.",
    details: parsed.error.issues.map(describeIssue),
  };
}

/**
 * Interpretuje surową odpowiedź modelu: powód zakończenia + tekst.
 * Nigdy nie "naprawia" wyniku — każdy problem zwraca jako błąd.
 */
export function interpretModelOutput(input: {
  finishReason: string | undefined;
  text: string | undefined;
}): AnalysisOutcome {
  const { finishReason, text } = input;

  if (finishReason === "length") {
    return {
      ok: false,
      kind: "truncated",
      message:
        "Odpowiedź modelu została ucięta (limit długości). Analiza jest niekompletna — spróbuj ponownie lub skróć wiadomość.",
    };
  }
  if (finishReason === "content-filter") {
    return {
      ok: false,
      kind: "refused",
      message: "Dostawca modelu zablokował odpowiedź (filtr treści). Brak analizy.",
    };
  }
  if (finishReason !== "stop") {
    return {
      ok: false,
      kind: "incomplete",
      message: `Model nie zakończył odpowiedzi poprawnie (powód: ${finishReason ?? "nieznany"}). Brak analizy.`,
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(text ?? "");
  } catch {
    return {
      ok: false,
      kind: "not_json",
      message:
        "Model odpowiedział tekstem zamiast wynikiem JSON (możliwa odmowa). Brak analizy.",
      details: text ? [`Początek odpowiedzi: ${text.slice(0, 200)}`] : undefined,
    };
  }

  return validateAnalysis(json);
}

// --- W3: ochrona przed prompt injection ---

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Neutralizuje znaczniki granic danych (<<< i >>>) w tekście klienta,
 * żeby nie mógł "zamknąć" bloku danych i udawać instrukcji serwera.
 */
export function neutralizeDelimiters(text: string): string {
  return text.replace(/<{3,}/g, "‹‹‹").replace(/>{3,}/g, "›››");
}

/**
 * Prompt analizy: wiadomość klienta zawsze jako dane między znacznikami.
 * previous (czat W3 custom 1.0): wcześniejsze wiadomości klienta, też jako dane.
 * Bez previous wynik jest taki sam jak w /api/analyze z W3.
 */
export function buildAnalysisPrompt(message: string, previous: string[] = []): string {
  const current = `Wiadomość klienta do analizy:\n<<<\n${neutralizeDelimiters(message.trim())}\n>>>`;
  if (previous.length === 0) return current;
  const context = previous
    .map((text, i) => `${i + 1}. ${neutralizeDelimiters(text.trim())}`)
    .join("\n");
  return `Wcześniejsze wiadomości klienta w tej rozmowie (kontekst, tylko dane):\n<<<\n${context}\n>>>\n\n${current}`;
}

export type AnalyzeRequest =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Z ciała żądania z przeglądarki bierze WYŁĄCZNIE pole "message".
 * Inne pola (send_now, role, instructions, schema…) są ignorowane —
 * nie trafiają do modelu i nie zmieniają działania serwera.
 */
export function parseAnalyzeRequest(body: unknown): AnalyzeRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Nieprawidłowe zapytanie." };
  }
  const message = (body as Record<string, unknown>).message;
  if (typeof message !== "string" || message.trim() === "") {
    return { ok: false, message: "Wiadomość do analizy nie może być pusta." };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, message: `Wiadomość jest za długa (max ${MAX_MESSAGE_LENGTH} znaków).` };
  }
  return { ok: true, message };
}

// --- Czat W3 custom 1.0: ta sama ścieżka co analiza ---

export const MAX_CHAT_CONTEXT_MESSAGES = 10;

export type ChatRequest =
  | { ok: true; current: string; previous: string[] }
  | { ok: false; message: string };

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) =>
      part && typeof part === "object" && (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("")
    .trim();
}

/**
 * Z historii czatu wysłanej przez przeglądarkę bierze WYŁĄCZNIE wiadomości klienta (role "user").
 * - "assistant": pomijane — przeglądarka nie może podsunąć modelowi "wcześniejszej
 *   wypowiedzi asystenta" (luka R4). Model nie widzi swoich poprzednich odpowiedzi.
 * - "system" lub inna rola: całe żądanie odrzucone.
 * - inne pola (send_now, role, instructions…): ignorowane.
 */
export function parseChatRequest(body: unknown): ChatRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Nieprawidłowe zapytanie." };
  }
  const messages = (body as Record<string, unknown>).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, message: "Brak wiadomości do wysłania." };
  }

  const userTexts: string[] = [];
  for (const m of messages) {
    const role = m && typeof m === "object" ? (m as { role?: unknown }).role : undefined;
    if (role === "assistant") continue;
    if (role !== "user") {
      return { ok: false, message: "Niedozwolona rola wiadomości. Klient może wysyłać tylko własne wiadomości." };
    }
    const text = textOf((m as { parts?: unknown }).parts);
    if (text.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, message: `Wiadomość jest za długa (max ${MAX_MESSAGE_LENGTH} znaków).` };
    }
    if (text !== "") userTexts.push(text);
  }

  const last = messages[messages.length - 1] as { role?: unknown; parts?: unknown };
  if (last?.role !== "user" || textOf(last.parts) === "") {
    return { ok: false, message: "Wiadomość nie może być pusta." };
  }

  const current = userTexts[userTexts.length - 1];
  const previous = userTexts.slice(0, -1).slice(-MAX_CHAT_CONTEXT_MESSAGES);
  return { ok: true, current, previous };
}

const CATEGORY_NAMES: Record<Analysis["category"], string> = {
  sales: "sales (oferta i cena)",
  support: "support (problem techniczny)",
  billing: "billing (płatność lub zwrot)",
  unknown: "unknown (brak rozpoznanej sprawy)",
};

/**
 * Odpowiedź czatu składana przez SERWER z wyniku analizy po walidacji.
 * Kategoria, priorytet i needs_review nie pochodzą z wolnego tekstu modelu.
 */
export function formatChatReply(analysis: Analysis): string {
  return [
    `Kategoria: ${CATEGORY_NAMES[analysis.category]}`,
    `Priorytet: ${analysis.priority === "high" ? "high (pilne)" : "normal"}`,
    `Szkic: ${analysis.draft}`,
    `Do sprawdzenia: ${
      analysis.needs_review
        ? "tak, wymaga decyzji pracownika (needs_review = true)"
        : "nie (needs_review = false)"
    }`,
  ].join("\n");
}

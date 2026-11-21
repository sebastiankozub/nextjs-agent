import { z } from "zod";
import { getToolName, isToolUIPart, type ModelMessage, type UIMessage } from "ai";

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

// --- Czat: limit historii wysyłanej do modelu ---

export const MAX_CHAT_CONTEXT_MESSAGES = 10;

/**
 * Wspólne budowanie odpowiedzi czatu z wyniku PO walidacji (czat ujednolicony).
 * Użytkownik czatu widzi tylko treść odpowiedzi — kategoria, priorytet
 * i needs_review zostają po stronie serwera (pełny wynik pokazuje panel „Analiza wiadomości”).
 */
export function buildChatReply(analysis: Analysis): string {
  return analysis.draft.trim();
}

// --- Czat: historia z przeglądarki -> wiadomości dla modelu (testowane w tests/analysis.test.mjs) ---

/**
 * Historia z przeglądarki -> wiadomości dla modelu:
 * - "user": tekst jako dane między <<< >>> (znaczniki neutralizowane) + zdjęcia
 *   (już sprawdzone przez validateImages); ostatnia oznaczona jako aktualna,
 * - "assistant": TYLKO gdy ma poprawny podpis serwera (replySig) – wtedy sam tekst
 *   sprawdzonej odpowiedzi, bez części narzędzi; bez podpisu – pomijana (luka R4 z L2W3),
 * - inna rola: odrzucenie całego zapytania.
 */
export function toChatModelMessages(
  messages: UIMessage[],
  isTrustedReply: (text: string, sig: unknown) => boolean,
): { ok: true; messages: ModelMessage[] } | { ok: false; error: string } {
  const out: ModelMessage[] = [];
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  if (messages.some((m) => m.role !== "user" && m.role !== "assistant")) {
    return { ok: false, error: "Niedozwolona rola wiadomości." };
  }

  for (let index = 0; index < messages.length; index++) {
    const m = messages[index];
    const text = m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();

    if (m.role === "assistant") {
      const sig = (m.metadata as { replySig?: unknown } | undefined)?.replySig;
      if (text && isTrustedReply(text, sig)) {
        out.push({ role: "assistant", content: text });
      }
      continue;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: `Wiadomość jest za długa (max ${MAX_MESSAGE_LENGTH} znaków).` };
    }
    const label =
      index === lastUserIndex
        ? "AKTUALNA wiadomość użytkownika – odpowiedz tylko na nią (dane)"
        : "Wcześniejsza wiadomość użytkownika – już obsłużona, tylko kontekst (dane)";

    const content: Extract<ModelMessage, { role: "user" }>["content"] = [];
    if (text) {
      content.push({ type: "text", text: `${label}:\n<<<\n${neutralizeDelimiters(text)}\n>>>` });
    }
    for (const p of m.parts) {
      if (p.type !== "file") continue;
      const match = /^data:([^;]+);base64,(.*)$/.exec(p.url);
      if (match) content.push({ type: "image", image: match[2], mediaType: match[1] });
    }
    if (content.length > 0) out.push({ role: "user", content });
  }

  // Ograniczenie kontekstu; zaczynamy zawsze od wiadomości użytkownika.
  let trimmed = out.slice(-MAX_CHAT_CONTEXT_MESSAGES * 2);
  while (trimmed.length > 0 && trimmed[0].role !== "user") trimmed = trimmed.slice(1);
  return { ok: true, messages: trimmed };
}

// --- Czat: odpowiedź z listą niedokończonych zadań (W2: limit kroków bez wprowadzania w błąd) ---

/** Schemat narzędzia „odpowiedz” w czacie = schemat analizy + opcjonalne niedokończone zadania. */
export const chatAnswerSchema = analysisSchema.extend({
  niedokonczone: z
    .array(
      z.strictObject({
        zadanie: z.string().min(3).max(200).describe("Co zostało do zrobienia, np. „wygenerować wykres kursów”"),
        polecenie: z
          .string()
          .min(3)
          .max(1000)
          .describe("Gotowa wiadomość do wysłania, żeby dokończyć – z już ustalonymi danymi"),
      }),
    )
    .max(3)
    .optional()
    .describe("Części zadania, których nie zdążyłeś wykonać (np. zabrakło kroków)"),
  // Lekcja 6, W3 (Standard): które fragmenty z searchKnowledge naprawdę posłużyły do odpowiedzi.
  zrodlaBazyWiedzy: z
    .array(z.number().int().positive())
    .max(10)
    .optional()
    .describe(
      "id fragmentów z searchKnowledge, z których wziąłeś informacje do draft – tylko użyte, nie wszystkie znalezione. " +
        "Pusta lista albo brak pola, gdy odpowiedź nie korzysta z bazy wiedzy.",
    ),
});

/** Fragment bazy wiedzy pokazywany pod odpowiedzią (metadane wiadomości knowledgeSources). */
export type KnowledgeSource = { id: number; tytul: string; tresc: string; podobienstwo: number };

export type UnfinishedTask = { zadanie: string; polecenie: string };

/** Jedno wywołanie narzędzia w zadaniu (zapisuje serwer – lib/agent-chat.ts). */
export type ToolCallRecord = { step: number; toolName: string; key: string; output: unknown; ms: number; ok: boolean };

/** Czego nie udało się sprawdzić: narzędzia, których ostatnie wywołanie zwróciło błąd. */
export function summarizeFailures(calls: ToolCallRecord[]): string[] {
  const lastByTool = new Map<string, ToolCallRecord>();
  for (const call of calls) lastByTool.set(call.toolName, call);
  return [...lastByTool.values()]
    .filter((call) => !call.ok)
    .map((call) => `${call.toolName}: ${describeToolOutput(call.output).replace(/^błąd: /, "")}`);
}

/** Notka dopisywana do odpowiedzi: czego nie udało się sprawdzić + czego nie zdążyłem. */
export function buildUnfinishedNote(tasks: UnfinishedTask[], failures: string[] = []): string {
  const parts: string[] = [];
  if (failures.length > 0) {
    parts.push(`Nie udało się sprawdzić:\n${failures.map((f) => `– ${f}`).join("\n")}`);
  }
  if (tasks.length > 0) {
    const list = tasks.map((t) => `– ${t.zadanie}`).join("\n");
    parts.push(
      `Nie zdążyłem jeszcze:\n${list}\nPropozycję polecenia wpisałem w pole wiadomości – wyślij ją, jeśli chcesz dokończyć.`,
    );
  }
  return parts.join("\n\n");
}

/** Jedno polecenie do pola wiadomości (gdy zadań jest kilka – łączymy je). */
export function buildContinuationPrompt(tasks: UnfinishedTask[]): string | null {
  if (tasks.length === 0) return null;
  if (tasks.length === 1) return tasks[0].polecenie;
  return tasks.map((t, i) => `${i + 1}. ${t.polecenie}`).join("\n");
}

/** Polecenie kontynuacji po twardym limicie (model nie zdążył nawet odpowiedzieć). */
export function buildLimitContinuationPrompt(lastUserText: string): string {
  const task = lastUserText.trim().slice(0, 500);
  return `Dokończ poprzednie zadanie: „${task}”. Wykorzystaj dane ustalone w poprzedniej odpowiedzi i nie pobieraj ich ponownie.`;
}

/** Krótki opis jednego wyniku narzędzia (do komunikatu o limicie kroków). */
export function describeToolOutput(output: unknown): string {
  if (output == null) return "brak wyniku";
  if (typeof output !== "object") return String(output);
  const o = output as Record<string, unknown>;
  if (typeof o.blad === "string") return `błąd: ${o.blad}`;
  if (typeof o.podsumowanie === "string") return o.podsumowanie;
  const text = Object.entries(o)
    .filter(([key]) => !["image", "zrodla", "pobrano"].includes(key))
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(", ");
  return text || "brak danych";
}

/** Nagłówek komunikatu, gdy pętla skończyła się na limicie (a model nie zdążył odpowiedzieć). */
export function buildLimitHeader(
  reason: "steps" | "toolCalls" | "time",
  limits: { maxSteps: number; maxToolCalls: number; maxTaskMs: number },
): string {
  if (reason === "toolCalls") return `Zatrzymałem się po ${limits.maxToolCalls} wywołaniach narzędzi.`;
  if (reason === "time") return `Zatrzymałem się po ${Math.round(limits.maxTaskMs / 1000)} s (limit czasu na zadanie).`;
  return `Zatrzymałem się po ${limits.maxSteps} krokach.`;
}

/** Wynik narzędzia zawiera błąd (pole „blad”). */
export function hasError(output: unknown): boolean {
  return typeof output === "object" && output !== null && typeof (output as { blad?: unknown }).blad === "string";
}

/**
 * Komunikat po limicie (kroki, wywołania narzędzi albo czas): nagłówek + to, co agent zdążył ustalić.
 * Nigdy pusta odpowiedź. Błędy narzędzi są widoczne na liście („błąd: …”).
 */
export function buildPartialReply(
  header: string,
  calls: Array<Pick<ToolCallRecord, "step" | "toolName" | "output">>,
): string {
  const found = calls.map((call) => {
    const opis =
      call.toolName === "generujObraz" && !hasError(call.output) ? "obraz wygenerowany" : describeToolOutput(call.output);
    const short = opis.length > 300 ? `${opis.slice(0, 300)}…` : opis;
    return `${call.step}. ${call.toolName}: ${short}`;
  });
  const next = "Propozycję polecenia, które dokończy zadanie, wpisałem w pole wiadomości.";
  if (found.length === 0) return `${header} Nie zdążyłem niczego ustalić. ${next}`;
  return `${header} Do tej pory ustaliłem:\n${found.join("\n")}\n\nNie zdążyłem dokończyć zadania. ${next}`;
}

// --- „Stop”: wynik częściowy składany w przeglądarce (serwer po zerwaniu połączenia już nic nie wyśle) ---

export const INTERRUPTED_NOTE = "Przerwane przez użytkownika.";

/** Co agent zdążył zrobić: wyniki narzędzi z numerem kroku (jak „Zatrzymałem się…” po limicie). */
export function partialFromParts(message: UIMessage): string[] {
  const lines: string[] = [];
  let step = 0;
  for (const part of message.parts) {
    if (part.type === "step-start") step++;
    if (!isToolUIPart(part)) continue;
    const name = getToolName(part);
    const nr = Math.max(step, 1);
    if (part.state === "output-available") {
      const opis = name === "generujObraz" ? "obraz wygenerowany (powyżej)" : describeToolOutput(part.output);
      lines.push(`${nr}. ${name}: ${opis.length > 300 ? `${opis.slice(0, 300)}…` : opis}`);
    } else if (part.state === "output-error") {
      lines.push(`${nr}. ${name}: błąd`);
    } else {
      lines.push(`${nr}. ${name}: przerwane w trakcie`);
    }
  }
  return lines;
}

/** Dopisuje do ostatniej odpowiedzi agenta wynik częściowy i „Przerwane przez użytkownika”. */
export function markInterrupted(messages: UIMessage[]): UIMessage[] {
  const last = messages[messages.length - 1];
  // Agent nie zdążył nic wysłać – dokładamy nową wiadomość z samą informacją.
  if (!last || last.role !== "assistant") {
    return [
      ...messages,
      {
        id: `interrupted-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text: INTERRUPTED_NOTE }],
        metadata: { interrupted: true },
      },
    ];
  }
  // Odpowiedź zdążyła przyjść w całości – nic nie dopisujemy.
  if (last.parts.some((p) => p.type === "text" && p.text.trim())) return messages;
  const found = partialFromParts(last);
  const text = found.length
    ? `${INTERRUPTED_NOTE} Do tej pory zrobiłem:\n${found.join("\n")}`
    : `${INTERRUPTED_NOTE} Nie zdążyłem niczego ustalić.`;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      parts: [...last.parts, { type: "text", text }],
      metadata: { ...(last.metadata as object | undefined), interrupted: true },
    },
  ];
}


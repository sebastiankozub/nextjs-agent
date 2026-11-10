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

function describeIssue(issue: z.core.$ZodIssue): string {
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

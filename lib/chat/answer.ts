import { tool } from "ai";
import {
  buildChatReply,
  buildContinuationPrompt,
  buildUnfinishedNote,
  chatAnswerSchema,
  summarizeFailures,
  type KnowledgeSource,
  type ToolCallRecord,
  validateAnalysis,
} from "../analysis";

export const ANSWER_TOOL = "odpowiedz";

/** Odpowiedź przyjęta przez narzędzie „odpowiedz” (wypełniana w trakcie pętli). */
export type AcceptedAnswer = {
  /** Tekst odpowiedzi złożony przez serwer (null = model jeszcze nie odpowiedział poprawnie). */
  reply: string | null;
  /** Propozycja następnej wiadomości (niedokończone zadania) – trafia do pola wiadomości w przeglądarce. */
  continuation: string | null;
  /** Fragmenty bazy wiedzy użyte w odpowiedzi (lista źródeł pod odpowiedzią). */
  knowledgeSources: KnowledgeSource[];
};

export function emptyAnswer(): AcceptedAnswer {
  return { reply: null, continuation: null, knowledgeSources: [] };
}

/** Krok zawiera wywołanie „odpowiedz” i ŻADNEGO innego narzędzia. */
export function isPureAnswerStep(step: { toolCalls: Array<{ toolName: string }> } | undefined): boolean {
  if (!step || step.toolCalls.length === 0) return false;
  return step.toolCalls.every((call) => call.toolName === ANSWER_TOOL);
}

/**
 * Jedyna droga do odpowiedzi: argumenty sprawdza schemat Zod (inputSchema),
 * potem wspólna walidacja serwera i budowanie tekstu.
 */
export function answerTool(calls: ToolCallRecord[], answer: AcceptedAnswer) {
  return tool({
    description:
      "Zakończ odpowiedź: przekaż wynik w schemacie analizy (category, priority, draft, needs_review). " +
      "draft to pełna treść odpowiedzi dla użytkownika. niedokonczone – części zadania, których nie wykonałeś.",
    inputSchema: chatAnswerSchema,
    execute: async ({ niedokonczone = [], zrodlaBazyWiedzy = [], ...analysis }) => {
      const outcome = validateAnalysis(analysis);
      if (!outcome.ok) {
        return { status: "odrzucono", powod: outcome.details?.join(" ") ?? outcome.message };
      }
      // Notkę o błędach narzędzi i niedokończonych zadaniach składa serwer – model nie musi.
      const reply = buildChatReply(outcome.analysis);
      const note = buildUnfinishedNote(niedokonczone, summarizeFailures(calls));
      answer.reply = note ? `${reply}\n\n${note}` : reply;
      answer.continuation = buildContinuationPrompt(niedokonczone);
      answer.knowledgeSources = pickKnowledgeSources(calls, zrodlaBazyWiedzy);
      return { status: "przyjeto" };
    },
  });
}

/**
 * Źródła pod odpowiedzią: tylko fragmenty, które searchKnowledge NAPRAWDĘ zwrócił w tym zadaniu
 * (model nie dopisze numeru spoza wyników), w kolejności podanej przez model.
 */
function pickKnowledgeSources(calls: ToolCallRecord[], ids: number[]): KnowledgeSource[] {
  const found = new Map<number, KnowledgeSource>();
  for (const call of calls) {
    if (call.toolName !== "searchKnowledge") continue;
    const out = call.output as { fragmenty?: KnowledgeSource[] } | undefined;
    for (const f of out?.fragmenty ?? []) found.set(f.id, f);
  }
  return [...new Set(ids)].map((id) => found.get(id)).filter((f): f is KnowledgeSource => f !== undefined);
}

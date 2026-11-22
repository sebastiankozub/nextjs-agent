import type { StepResult, ToolSet } from "ai";
import { buildLimitContinuationPrompt, buildLimitHeader, buildPartialReply } from "../analysis";
import type { LimitReason } from "../instructions";
import { isPureAnswerStep, type AcceptedAnswer } from "./answer";
import type { AgentTask } from "./task";

const FALLBACK_REPLY =
  "Nie udało się przygotować sprawdzonej odpowiedzi. Spróbuj ponownie albo zadaj pytanie inaczej.";

export type FinalReply = {
  text: string;
  /** Odpowiedź przyjęta przez „odpowiedz” (a nie wynik częściowy ani komunikat zastępczy). */
  answered: boolean;
  continuation: string | null;
};

/**
 * Odpowiedź liczy się tylko z kroku „czystego” (samo odpowiedz). Inaczej: limit (kroki, wywołania
 * narzędzi, czas) → „Zatrzymałem się…” + to, co ustalono, albo inny problem – nigdy pusta odpowiedź.
 */
export async function composeFinalReply(
  task: AgentTask,
  answer: AcceptedAnswer,
  stepsPromise: PromiseLike<Array<StepResult<ToolSet>>>,
  lastUserText: string,
): Promise<FinalReply> {
  const steps = task.timedOut ? [] : await stepsPromise.then((s) => s, () => []);
  const answered = answer.reply !== null && (task.timedOut || isPureAnswerStep(steps.at(-1)));
  if (answered) return { text: answer.reply!, answered, continuation: answer.continuation };

  const reason: LimitReason | null = task.timedOut
    ? "time"
    : (task.forcedReason ?? (steps.length >= task.limits.maxSteps ? "steps" : null));
  if (!reason) return { text: FALLBACK_REPLY, answered, continuation: null };
  return {
    text: buildPartialReply(buildLimitHeader(reason, task.limits), task.calls),
    answered,
    continuation: lastUserText ? buildLimitContinuationPrompt(lastUserText) : null,
  };
}

import type { UIMessageChunk, UIMessageStreamWriter } from "ai";
import { ANSWER_TOOL } from "./answer";
import type { AgentTask } from "./task";

export type ProgressResult = {
  /** Czas każdego kroku modelu (start-step → finish-step), także kroku przerwanego. */
  stepMs: number[];
  /** Końcowy chunk „finish” – wysyłamy go sami, po odpowiedzi i statystykach. */
  finishChunk: UIMessageChunk | null;
  /** Model zgłosił błąd (nie: limit czasu ani „Stop”). */
  failed: boolean;
};

/**
 * Przepuszcza do przeglądarki postęp na żywo (kroki, narzędzia, źródła, metadane),
 * a zatrzymuje wolny tekst modelu i surowe argumenty „odpowiedz”. Przy okazji mierzy kroki.
 * `startMetadata` idzie zaraz po „start” – np. numer rozmowy (przeglądarka zna go nawet po „Stop”).
 */
export async function forwardProgress(
  uiStream: ReadableStream<UIMessageChunk>,
  writer: UIMessageStreamWriter,
  task: AgentTask,
  startMetadata: Record<string, unknown>,
): Promise<ProgressResult> {
  const answerCallIds = new Set<string>();
  const stepMs: number[] = [];
  let stepStartedAt: number | null = null;
  let finishChunk: UIMessageChunk | null = null;
  let failed = false;
  const interrupted = () => task.timedOut || task.stoppedByUser;

  const reader = uiStream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      switch (value.type) {
        case "start":
          writer.write(value);
          writer.write({ type: "message-metadata", messageMetadata: startMetadata });
          continue;
        case "start-step":
          stepStartedAt = Date.now();
          break;
        case "finish-step":
          if (stepStartedAt !== null) stepMs.push(Date.now() - stepStartedAt);
          stepStartedAt = null;
          break;
        case "finish":
          finishChunk = value;
          continue;
        case "error":
        case "abort":
          // Limit czasu i „Stop” to nie awaria – wynik częściowy składamy później.
          if (interrupted()) continue;
          failed = value.type === "error";
          break;
      }
      if (!isHidden(value, answerCallIds)) writer.write(value);
    }
  } catch (error) {
    if (!interrupted()) throw error;
  } finally {
    task.stopClock();
  }
  if (stepStartedAt !== null) stepMs.push(Date.now() - stepStartedAt);
  return { stepMs, finishChunk, failed };
}

/** Filtr strumienia: blokuje wolny tekst / rozumowanie i wszystko, co dotyczy wywołań „odpowiedz”. */
function isHidden(chunk: UIMessageChunk, answerCallIds: Set<string>): boolean {
  switch (chunk.type) {
    case "text-start":
    case "text-delta":
    case "text-end":
    case "reasoning-start":
    case "reasoning-delta":
    case "reasoning-end":
      return true;
  }
  if ("toolCallId" in chunk && typeof chunk.toolCallId === "string") {
    if ("toolName" in chunk && chunk.toolName === ANSWER_TOOL) answerCallIds.add(chunk.toolCallId);
    return answerCallIds.has(chunk.toolCallId);
  }
  return false;
}

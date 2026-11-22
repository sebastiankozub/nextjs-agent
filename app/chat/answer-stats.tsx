import type { UIMessage } from "ai";
import { isGeneratedImageMessage } from "./messages";
import { TOOL_LABELS } from "./tool-labels";

// Pod odpowiedzią o zdjęciu i pod wygenerowanym obrazem: model z odpowiedzi API.
export function ModelUsed({ message, previous }: { message: UIMessage; previous?: UIMessage }) {
  if (message.role !== "assistant") return null;
  const aboutImage =
    isGeneratedImageMessage(message) ||
    (previous?.role === "user" && previous.parts.some((part) => part.type === "file"));
  if (!aboutImage) return null;
  const modelId = (message.metadata as { modelId?: string } | undefined)?.modelId;
  if (!modelId) return null;
  return <small className="model-used">model: {modelId}</small>;
}

// Statystyki pod odpowiedzią (serwer: metadane „stats”): kroki, wywołania narzędzi, czasy.
type AnswerStatsData = {
  steps: number;
  toolCalls: number;
  totalMs: number;
  stepMs: number[];
  calls: Array<{ step: number; toolName: string; ms: number; ok: boolean }>;
  limit: "steps" | "toolCalls" | "time" | null;
};

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

// Polska odmiana: 1 krok, 2–4 kroki, 5+ kroków (12–14 też „kroków”).
function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

const LIMIT_LABELS = { steps: "limit kroków", toolCalls: "limit wywołań narzędzi", time: "limit czasu" };

export function AnswerStats({ message }: { message: UIMessage }) {
  if (message.role !== "assistant") return null;
  const stats = (message.metadata as { stats?: AnswerStatsData } | undefined)?.stats;
  if (!stats) return null;
  const { steps, toolCalls, totalMs, stepMs, calls, limit } = stats;
  return (
    <small className="answer-stats">
      <span>
        {steps} {plural(steps, "krok", "kroki", "kroków")} · {toolCalls}{" "}
        {plural(toolCalls, "wywołanie narzędzia", "wywołania narzędzi", "wywołań narzędzi")} · razem {seconds(totalMs)}
        {limit && ` · ${LIMIT_LABELS[limit]}`}
      </span>
      {stepMs.length > 0 && <span>kroki: {stepMs.map((ms, i) => `${i + 1}. ${seconds(ms)}`).join(" · ")}</span>}
      {calls.length > 0 && (
        <span>
          narzędzia:{" "}
          {calls
            .map((c) => `${c.ok ? "" : "✗ "}${c.step}. ${TOOL_LABELS[c.toolName] ?? c.toolName} ${seconds(c.ms)}`)
            .join(" · ")}
        </span>
      )}
    </small>
  );
}

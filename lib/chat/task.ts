import type { ToolCallRecord } from "../analysis";
import { AGENT_LIMITS, type LimitReason } from "../instructions";

/** Statystyki zadania wysyłane do przeglądarki (pokazywane małym tekstem pod odpowiedzią). */
export type ChatStats = {
  steps: number;
  toolCalls: number;
  totalMs: number;
  stepMs: number[];
  calls: Array<{ step: number; toolName: string; ms: number; ok: boolean }>;
  limit: LimitReason | null;
};

/**
 * Stan jednego zadania agenta (jednej odpowiedzi na wiadomość): limity, licznik kroków,
 * historia wywołań narzędzi, zegar i przerwania (limit czasu albo „Stop” użytkownika).
 */
export class AgentTask {
  readonly limits = AGENT_LIMITS;
  readonly calls: ToolCallRecord[] = [];
  /** Numer kroku pętli (od 1) – ustawiany w prepareStep, zapisywany przy każdym wywołaniu narzędzia. */
  currentStep = 1;
  /** Pierwszy limit, który zmusił model do odpowiedzi (null = pętla skończyła się sama). */
  forcedReason: LimitReason | null = null;

  private readonly startedAt = Date.now();
  private readonly deadline = new AbortController();
  private readonly deadlineTimer: ReturnType<typeof setTimeout>;

  constructor(private readonly requestSignal?: AbortSignal) {
    // Twardy limit czasu całego zadania – przerywa wywołanie modelu.
    this.deadlineTimer = setTimeout(() => this.deadline.abort(), this.limits.maxTaskMs);
    requestSignal?.addEventListener("abort", () => console.info("[api/agent] przerwane przez użytkownika"), {
      once: true,
    });
  }

  elapsed(): number {
    return Date.now() - this.startedAt;
  }

  remainingMs(): number {
    return this.limits.maxTaskMs - this.elapsed();
  }

  /** Przekroczony limit czasu całego zadania. */
  get timedOut(): boolean {
    return this.deadline.signal.aborted;
  }

  /** Użytkownik kliknął „Stop” (połączenie zerwane) – nikt już nie zobaczy dalszej pracy. */
  get stoppedByUser(): boolean {
    return this.requestSignal?.aborted === true;
  }

  /** Sygnał dla modelu: limit czasu ALBO „Stop”. */
  get abortSignal(): AbortSignal {
    return this.requestSignal ? AbortSignal.any([this.deadline.signal, this.requestSignal]) : this.deadline.signal;
  }

  stopClock(): void {
    clearTimeout(this.deadlineTimer);
  }

  /** Czy przed krokiem `stepNumber` (od 0) trzeba już kończyć – i z jakiego powodu. */
  limitBeforeStep(stepNumber: number): LimitReason | null {
    const answerReserveMs = Math.min(15_000, this.limits.maxTaskMs / 4);
    if (stepNumber >= this.limits.maxSteps - 1) return "steps";
    if (this.calls.length >= this.limits.maxToolCalls) return "toolCalls";
    if (this.elapsed() >= this.limits.maxTaskMs - answerReserveMs) return "time";
    return null;
  }

  stats(stepMs: number[]): ChatStats {
    return {
      steps: stepMs.length,
      toolCalls: this.calls.length,
      totalMs: this.elapsed(),
      stepMs,
      calls: this.calls.map(({ step, toolName, ms, ok }) => ({ step, toolName, ms, ok })),
      limit: this.timedOut ? "time" : this.forcedReason,
    };
  }
}

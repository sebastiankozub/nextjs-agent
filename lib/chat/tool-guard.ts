import { hasError } from "../analysis";
import type { AgentTask } from "./task";

type Execute = (input: unknown, options: unknown) => unknown;

/** Wolne narzędzia (model językowy / generowanie obrazu po drodze) – dłuższy limit oczekiwania. */
const SLOW_TOOLS = new Set(["generujObraz", "wyszukajWInternecie"]);
const TIMEOUT = Symbol("timeout");

/**
 * Owija każde narzędzie (oprócz `except`) strażnikiem zadania.
 * UWAGA: tworzymy KOPIE narzędzi. Obiekty z lib/tools/ są wspólne (także dla /dashboard
 * i kolejnych zapytań czatu) – podmiana execute w oryginale „przyklejała” strażnika
 * jednego zadania na stałe (po jego limicie czasu wszystko zwracało „Brak czasu…”).
 */
export function guardTools<T extends Record<string, unknown>>(tools: T, task: AgentTask, except: string): T {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => {
      const execute = (t as { execute?: Execute }).execute;
      return [name, name !== except && execute ? { ...(t as object), execute: guard(task, name, execute) } : t];
    }),
  ) as T;
}

/**
 * Strażnik jednego narzędzia: limit wywołań, brak powtórek nieudanych wywołań,
 * timeout odpowiedzi API, pomiar czasu. Narzędzie nigdy nie rzuca – zwraca { blad }.
 */
function guard(task: AgentTask, name: string, execute: Execute): Execute {
  return async (input, options) => {
    const key = `${name}:${JSON.stringify(input)}`;
    const refusal = checkBeforeCall(task, name, key);
    if (refusal) return { blad: refusal };

    const timeoutMs = Math.min(toolTimeoutMs(task, name), task.remainingMs());
    const started = Date.now();
    const record = (output: unknown) => {
      const ok = !hasError(output);
      task.calls.push({ step: task.currentStep, toolName: name, key, output, ms: Date.now() - started, ok });
      return output;
    };
    try {
      const output = await withTimeout(Promise.resolve(execute(input, options)), timeoutMs);
      if (output === TIMEOUT) {
        return record({ blad: `Źródło nie odpowiada (brak odpowiedzi w ${Math.round(timeoutMs / 1000)} s).` });
      }
      return record(output);
    } catch (error) {
      console.error(`[api/agent ${name}]`, error);
      return record({ blad: "Źródło nie odpowiada (błąd połączenia)." });
    }
  };
}

/** Powód odmowy wywołania albo null, gdy narzędzie może ruszyć. */
function checkBeforeCall(task: AgentTask, name: string, key: string): string | null {
  const { maxToolCalls } = task.limits;
  if (task.stoppedByUser) return "Przerwane przez użytkownika.";
  if (task.calls.length >= maxToolCalls) {
    return `Wykorzystano limit ${maxToolCalls} wywołań narzędzi – nie wywołano ${name}.`;
  }
  if (task.calls.some((call) => call.key === key && !call.ok)) {
    return "To samo wywołanie już się nie udało – nie powtarzam go. Powiedz, czego nie udało się sprawdzić.";
  }
  if (task.remainingMs() < 1000) return "Brak czasu na kolejne narzędzie.";
  return null;
}

/** Narzędzie z danymi: wszystkie próby zapytania do API (czas próby × (1 + ponowienia) + przerwy). */
function toolTimeoutMs(task: AgentTask, name: string): number {
  const { toolTimeoutMs, toolRetries, slowToolTimeoutMs } = task.limits;
  if (SLOW_TOOLS.has(name)) return slowToolTimeoutMs;
  return toolTimeoutMs * (toolRetries + 1) + 500 * toolRetries;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<typeof TIMEOUT>((resolve) => (timer = setTimeout(() => resolve(TIMEOUT), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

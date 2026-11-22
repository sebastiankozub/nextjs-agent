import { AGENT_LIMITS } from "../instructions";

// Wspólne dla narzędzi: strefa Polski, znacznik „pobrano”, pobieranie JSON z ponowieniami.

export const TIMEZONE = "Europe/Warsaw";
// Ile czeka jedna próba zapytania do API (AGENT_TOOL_TIMEOUT_SECONDS, domyślnie 6 s).
const TIMEOUT_MS = AGENT_LIMITS.toolTimeoutMs;

export function teraz() {
  return new Date().toLocaleString("pl-PL", { timeZone: TIMEZONE });
}

// Pobiera JSON z publicznego API. Nie rzuca wyjątków – zwraca { ok, ... }.
// Jedna próba czeka najwyżej TIMEOUT_MS. Po błędzie sieci, przekroczonym czasie albo 5xx/429
// ponawiamy (AGENT_TOOL_RETRIES, domyślnie 1 raz) po krótkiej przerwie. 4xx (np. 404) – bez ponawiania.
const RETRY_PAUSE_MS = 500;

export async function getJson(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: true; data: any } | { ok: false; status?: number; reason?: string }> {
  let last: { ok: false; status?: number; reason?: string } = { ok: false };
  for (let attempt = 0; attempt <= AGENT_LIMITS.toolRetries; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS));
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "application/json", ...extraHeaders },
        cache: "no-store",
      });
      if (res.status === 204) return { ok: true, data: null };
      if (res.ok) return { ok: true, data: await res.json() };
      let reason: string | undefined;
      try {
        reason = (await res.json())?.reason;
      } catch {}
      last = { ok: false, status: res.status, reason };
      const retryable = res.status >= 500 || res.status === 429;
      console.error(`[tools] fetch ${url} → HTTP ${res.status} (próba ${attempt + 1})`);
      if (!retryable) return last;
    } catch (error) {
      const name = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`[tools] fetch ${url} → ${name} (próba ${attempt + 1})`);
      last = { ok: false };
    }
  }
  return last;
}

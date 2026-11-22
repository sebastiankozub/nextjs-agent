import { tool } from "ai";
import { z } from "zod";
import { teraz } from "./http";

// Tylko informacja tak/nie o zmiennych środowiskowych – nigdy ich wartości.

const ZMIENNE_WYMAGANE = ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "CHAT_PASSWORD", "SESSION_SECRET"] as const;
const ZMIENNE_OPCJONALNE = [
  "OPENROUTER_IMAGE_MODEL",
  "COINGECKO_DEMO_API_KEY",
  "AGENT_MAX_STEPS",
  "AGENT_MAX_TOOL_CALLS",
  "AGENT_MAX_TASK_SECONDS",
  "AGENT_TOOL_TIMEOUT_SECONDS",
  "AGENT_SLOW_TOOL_TIMEOUT_SECONDS",
] as const;
const ustawiona = (name: string) => ((process.env[name] ?? "").trim() !== "" ? "tak" : "nie");

export function createDiagnostyka(
  info: () => { model: string; narzedzia: string[]; limitKrokow: number; limity?: Record<string, number> },
) {
  return tool({
    description:
      "Diagnostyka agenta: nazwa modelu, lista dostępnych narzędzi, limit kroków i informacja, " +
      "czy wymagane zmienne środowiskowe są ustawione (tylko tak/nie). " +
      "Użyj, gdy użytkownik pyta o stan, konfigurację lub gotowość agenta.",
    inputSchema: z.object({}),
    execute: async () => {
      const { model, narzedzia, limitKrokow, limity } = info();
      const wymagane = Object.fromEntries(ZMIENNE_WYMAGANE.map((n) => [n, ustawiona(n)]));
      const opcjonalne = Object.fromEntries(ZMIENNE_OPCJONALNE.map((n) => [n, ustawiona(n)]));
      const brakuje = ZMIENNE_WYMAGANE.filter((n) => wymagane[n] === "nie");
      return {
        model,
        narzedzia,
        liczbaNarzedzi: narzedzia.length,
        limitKrokow,
        limity,
        zmienneWymagane: wymagane,
        zmienneOpcjonalne: opcjonalne,
        gotowy: brakuje.length === 0 ? "tak" : `nie – brakuje: ${brakuje.join(", ")}`,
        pobrano: teraz(),
      };
    },
  });
}

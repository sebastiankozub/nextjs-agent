import { tool } from "ai";
import { z } from "zod";
import { teraz } from "./http";

// Na razie w pamięci procesu – znikają po restarcie serwera (bazę danych dodamy na lekcji 5).
// globalThis: przeżywa przeładowanie modułu w trybie dev. Na Vercelu każda instancja ma własną pamięć.

type Notatka = { id: number; tresc: string; zapisano: string };
const MAX_NOTATEK = 50;
const store = globalThis as unknown as { __studioNovaNotatki?: Notatka[]; __studioNovaNotatkiId?: number };
const notatkiStore = (store.__studioNovaNotatki ??= []);

export const notatki = tool({
  description:
    "Zapisuje notatkę użytkownika albo pokazuje wszystkie zapisane notatki. " +
    "Użyj, gdy użytkownik prosi „zapisz / zanotuj / zapamiętaj …” (akcja zapisz) albo „pokaż moje notatki” (akcja pokaz). " +
    "Notatki są w pamięci serwera i znikają po jego restarcie.",
  inputSchema: z.object({
    akcja: z.enum(["zapisz", "pokaz"]),
    tresc: z.string().min(1).max(500).optional().describe("Treść notatki – wymagana przy akcji zapisz"),
  }),
  execute: async ({ akcja, tresc }) => {
    const pobrano = teraz();
    if (akcja === "zapisz") {
      if (!tresc?.trim()) return { blad: "Podaj treść notatki do zapisania.", pobrano };
      store.__studioNovaNotatkiId = (store.__studioNovaNotatkiId ?? 0) + 1;
      const notatka = { id: store.__studioNovaNotatkiId, tresc: tresc.trim(), zapisano: pobrano };
      notatkiStore.push(notatka);
      if (notatkiStore.length > MAX_NOTATEK) notatkiStore.shift();
      return { zapisano: notatka, liczbaNotatek: notatkiStore.length, pobrano };
    }
    return {
      liczbaNotatek: notatkiStore.length,
      notatki: notatkiStore.map((n) => ({ ...n })),
      ...(notatkiStore.length === 0 ? { uwaga: "Brak zapisanych notatek." } : {}),
      uwagaTechniczna: "Notatki są w pamięci serwera – znikają po restarcie.",
      pobrano,
    };
  },
});

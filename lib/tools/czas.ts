import { tool } from "ai";
import { z } from "zod";
import { TIMEZONE, teraz } from "./http";
import { czasWStrefie, UWAGA_KRAJ, lokalnyNaUTC, poprawnaStrefa, ustalMiejsce, ustalStrefe, wStrefie } from "./strefy";

// Narzędzia czasu: czas teraz, strefa dla miejsca, przeliczanie godziny między miejscami.

export const czas = tool({
  description:
    "Aktualna data, dzień tygodnia i godzina w podanej strefie czasowej (domyślnie Polska, Europe/Warsaw). " +
    "Użyj, gdy pytanie dotyczy „dziś”, „jutro”, dnia tygodnia, godziny, liczenia dni – nie zgaduj daty z pamięci. " +
    "Dla innego miejsca podaj strefę IANA (np. Europe/Lisbon); gdy jej nie znasz, najpierw użyj strefaCzasowa.",
  inputSchema: z.object({
    strefa: z
      .string()
      .min(3)
      .max(60)
      .optional()
      .describe("Strefa czasowa IANA, np. Europe/Lisbon, America/New_York. Pomiń dla Polski."),
  }),
  execute: async ({ strefa }) => {
    const pobrano = teraz();
    const timeZone = strefa?.trim() || TIMEZONE;
    if (!poprawnaStrefa(timeZone)) {
      return {
        blad: `Nie znam strefy czasowej „${strefa}”. Podaj nazwę IANA (np. Europe/Lisbon) albo ustal ją narzędziem strefaCzasowa.`,
        pobrano,
      };
    }
    return { ...czasWStrefie(timeZone), pobrano };
  },
});

export const strefaCzasowa = tool({
  description:
    "Ustala strefę czasową (IANA) dla miasta, kraju albo obu (dla precyzji, np. „Paryż” + „USA”) " +
    "na podstawie geokodowania Open-Meteo i podaje aktualną godzinę na miejscu oraz różnicę względem Polski. " +
    "Użyj przy pytaniach „jaka strefa czasowa jest w…”, „która godzina w…”, „ile godzin różnicy z…”.",
  inputSchema: z
    .object({
      miasto: z.string().min(2).max(80).optional().describe("Nazwa miasta, np. „Lizbona”"),
      kraj: z.string().min(2).max(80).optional().describe("Nazwa kraju po polsku albo kod ISO, np. „Portugalia” albo „PT”"),
    })
    .refine((v) => v.miasto || v.kraj, { message: "Podaj miasto, kraj albo oba." }),
  execute: async ({ miasto, kraj }) => {
    const pobrano = teraz();
    const s = await ustalStrefe(miasto, kraj);
    if (!s.ok) return { blad: s.blad, pobrano };
    return {
      lokalizacja: s.lokalizacja,
      ...czasWStrefie(s.timeZone),
      ...(s.tylkoKraj ? { uwaga: UWAGA_KRAJ } : {}),
      zrodlo: "Open-Meteo Geocoding (open-meteo.com)",
      pobrano,
    };
  },
});

export const przeliczCzas = tool({
  description:
    "Przelicza godzinę albo przedział godzin z jednego miejsca na czas lokalny w innych miejscach " +
    "(np. spotkanie, połączenie, start transmisji, odlot/przylot, godziny otwarcia). " +
    "Miejsca: miasto („Nowy Jork”), „miasto, kraj” („Paryż, USA”), kraj albo strefa IANA (America/New_York). " +
    "Uwzględnia zmianę czasu letniego dla podanej daty i zmianę dnia. Domyślnie źródłem jest Polska i dzisiejsza data – " +
    "dla innej daty („jutro”) najpierw ustal ją narzędziem czas.",
  inputSchema: z.object({
    godzina: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("Godzina początkowa GG:MM, np. 15:00"),
    godzinaDo: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe("Koniec przedziału GG:MM (opcjonalnie)"),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data RRRR-MM-DD w miejscu źródłowym; domyślnie dziś"),
    z: z.string().min(2).max(80).optional().describe("Miejsce źródłowe; domyślnie Polska"),
    na: z.array(z.string().min(2).max(80)).min(1).max(8).describe("Miejsca docelowe, np. [„Nowy Jork”, „Tokio”]"),
  }),
  execute: async ({ godzina, godzinaDo, data, z: skad = "Polska", na }) => {
    const pobrano = teraz();
    const zrodlo = await ustalMiejsce(skad);
    if (!zrodlo.ok) return { blad: zrodlo.blad, pobrano };

    const dzien = data ?? new Intl.DateTimeFormat("sv-SE", { timeZone: zrodlo.timeZone }).format(new Date());
    const start = lokalnyNaUTC(dzien, godzina, zrodlo.timeZone);
    let koniec: Date | null = null;
    if (godzinaDo) {
      koniec = lokalnyNaUTC(dzien, godzinaDo, zrodlo.timeZone);
      if (koniec <= start) koniec = new Date(koniec.getTime() + 24 * 3600 * 1000); // przedział przez północ
    }

    const cele = await Promise.all(
      na.map(async (miejsce) => {
        const s = await ustalMiejsce(miejsce);
        if (!s.ok) return { miejsce, blad: s.blad };
        const a = wStrefie(start, s.timeZone);
        const b = koniec ? wStrefie(koniec, s.timeZone) : null;
        return {
          miejsce: s.lokalizacja,
          strefa: s.timeZone,
          od: a,
          ...(b ? { do: b } : {}),
          zapis: b
            ? `${a.godzina}–${b.godzina}${b.data !== a.data ? ` (do ${b.data})` : ""}, ${a.dzienTygodnia} ${a.data}`
            : `${a.godzina}, ${a.dzienTygodnia} ${a.data}`,
          ...(s.tylkoKraj ? { uwaga: UWAGA_KRAJ } : {}),
        };
      }),
    );

    return {
      zrodlo: { miejsce: zrodlo.lokalizacja, strefa: zrodlo.timeZone, data: dzien, godzina, ...(godzinaDo ? { godzinaDo } : {}) },
      wyniki: cele,
      dane: "Open-Meteo Geocoding (open-meteo.com) + baza stref IANA",
      pobrano,
    };
  },
});

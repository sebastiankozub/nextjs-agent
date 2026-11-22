import { tool } from "ai";
import { z } from "zod";
import { getJson, teraz } from "./http";
import { kodKraju, NAGER, nazwyKrajow } from "./kraje";

export const swieta = tool({
  description:
    "Dni wolne od pracy (święta państwowe) w podanym kraju i roku z publicznego API Nager.Date, " +
    "opcjonalnie tylko w wybranym miesiącu. Użyj przy pytaniach o święta, dni wolne, długie weekendy. " +
    "Kraj: polska nazwa (np. „Portugalia”) albo kod ISO (PT). Rok ustal narzędziem czas, gdy nie jest podany.",
  inputSchema: z.object({
    kraj: z.string().min(2).max(60).describe("Kraj: polska nazwa albo kod ISO 3166-1, np. „Portugalia” / „PT”"),
    rok: z.number().int().min(1975).max(2075).describe("Rok, np. 2026"),
    miesiac: z.number().int().min(1).max(12).optional().describe("Numer miesiąca 1–12 (opcjonalnie)"),
  }),
  execute: async ({ kraj, rok, miesiac }) => {
    const pobrano = teraz();
    const zrodlo = "Nager.Date (date.nager.at)";

    const kod = await kodKraju(kraj);
    if (!kod.ok) return { blad: kod.blad, pobrano };

    const res = await getJson(`${NAGER}/PublicHolidays/${rok}/${kod.kod}`);
    if (!res.ok) {
      return {
        blad:
          res.status === 404
            ? `Nager.Date nie zna kraju o kodzie ${kod.kod}.`
            : "Serwis świąt (Nager.Date) nie odpowiada. Spróbuj za chwilę.",
        pobrano,
      };
    }

    type Swieto = { date: string; localName: string; name: string; global: boolean; counties: string[] | null; types?: string[] };
    let lista: Swieto[] = (res.data ?? []).filter((s: Swieto) => !s.types || s.types.includes("Public"));
    if (miesiac) lista = lista.filter((s) => Number(s.date.slice(5, 7)) === miesiac);

    const nazwaKraju = nazwyKrajow.of(kod.kod) ?? kod.kod;
    return {
      kraj: nazwaKraju,
      kod: kod.kod,
      rok,
      ...(miesiac ? { miesiac } : {}),
      liczba: lista.length,
      swieta: lista.map((s) => ({
        data: s.date,
        dzienTygodnia: new Date(`${s.date}T12:00:00Z`).toLocaleDateString("pl-PL", { weekday: "long", timeZone: "UTC" }),
        nazwa: s.localName,
        nazwaAng: s.name,
        ...(s.global ? {} : { tylkoRegiony: s.counties ?? [] }),
      })),
      ...(lista.length === 0 ? { uwaga: "Brak dni wolnych w podanym okresie." } : {}),
      zrodlo,
      pobrano,
    };
  },
});

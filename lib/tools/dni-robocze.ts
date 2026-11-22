import { tool } from "ai";
import { z } from "zod";
import { teraz } from "./http";
import {
  dniMiedzy,
  dodajDniRobocze,
  dzienTyg,
  policzDniRobocze,
  poprawnaData,
  szacowanyKoniec,
  type Swieta,
} from "./kalendarz";
import { kodKraju, nazwyKrajow, swietaWRoku } from "./kraje";

// Dni robocze: weekendy + ogólnokrajowe święta z Nager.Date.
// Pobieranie świąt (async) jest tutaj, liczenie – czyste funkcje w kalendarz.ts.

const ZRODLO = "Nager.Date (date.nager.at) – święta ogólnokrajowe";

export const dniRobocze = tool({
  description:
    "Liczy na dniach roboczych (bez sobót, niedziel i ogólnokrajowych świąt danego kraju; dane świąt: Nager.Date). " +
    "Tryb 1: data ± N dni roboczych (podaj od i dni, np. termin płatności, realizacji, odpowiedzi, dostawy; ujemne dni = wstecz). " +
    "Tryb 2: ile dni roboczych jest między datami (podaj od i do; liczone włącznie z obiema datami). " +
    "Domyślnie Polska. Gdy użytkownik mówi „dziś”, „od poniedziałku”, najpierw ustal datę narzędziem czas.",
  inputSchema: z
    .object({
      od: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data początkowa RRRR-MM-DD"),
      dni: z.number().int().min(-366).max(366).optional().describe("Tryb 1: ile dni roboczych dodać (ujemne = odjąć)"),
      do: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Tryb 2: data końcowa RRRR-MM-DD"),
      kraj: z.string().min(2).max(60).optional().describe("Kraj (nazwa po polsku albo kod ISO); domyślnie Polska"),
    })
    .refine((v) => (v.dni === undefined) !== (v.do === undefined), {
      message: "Podaj albo liczbę dni (dni), albo datę końcową (do).",
    }),
  execute: async ({ od, dni, do: doDaty, kraj = "PL" }) => {
    const pobrano = teraz();
    if (!poprawnaData(od) || (doDaty && !poprawnaData(doDaty))) {
      return { blad: "Nieprawidłowa data – użyj formatu RRRR-MM-DD.", pobrano };
    }
    const kod = await kodKraju(kraj);
    if (!kod.ok) return { blad: kod.blad, pobrano };
    const nazwaKraju = nazwyKrajow.of(kod.kod) ?? kod.kod;

    if (dni !== undefined) {
      const swieta = await wczytajSwieta(kod.kod, od, szacowanyKoniec(od, dni));
      if (!swieta.ok) return { blad: swieta.blad, pobrano };
      const r = dodajDniRobocze(od, dni, swieta.mapa);
      return {
        tryb: "data ± dni robocze",
        kraj: nazwaKraju,
        od, odDzien: dzienTyg(od),
        dniRobocze: dni,
        wynik: r.data, wynikDzien: dzienTyg(r.data),
        pominieteWeekendy: r.weekendy,
        pominieteSwieta: r.swieta,
        zrodlo: ZRODLO, pobrano,
      };
    }

    const [a, b] = od <= doDaty! ? [od, doDaty!] : [doDaty!, od];
    if (dniMiedzy(a, b) > 3660) return { blad: "Zakres może mieć najwyżej 10 lat.", pobrano };
    const swieta = await wczytajSwieta(kod.kod, a, b);
    if (!swieta.ok) return { blad: swieta.blad, pobrano };
    const r = policzDniRobocze(a, b, swieta.mapa);
    return {
      tryb: "liczba dni roboczych (włącznie z obiema datami)",
      kraj: nazwaKraju,
      od: a, do: b,
      dniRobocze: r.dniRobocze,
      dniKalendarzowe: dniMiedzy(a, b) + 1,
      weekendy: r.weekendy,
      swieta: r.swieta,
      zrodlo: ZRODLO, pobrano,
    };
  },
});

/** Święta z wszystkich lat między dwiema datami (w dowolnej kolejności), połączone w jedną mapę. */
async function wczytajSwieta(kod: string, a: string, b: string): Promise<{ ok: true; mapa: Swieta } | { ok: false; blad: string }> {
  const [r1, r2] = [Number(a.slice(0, 4)), Number(b.slice(0, 4))].sort((x, y) => x - y);
  const mapa: Swieta = new Map();
  for (let rok = r1; rok <= r2; rok++) {
    const r = await swietaWRoku(kod, rok);
    if (!r.ok) return r;
    for (const [data, nazwa] of r.mapa) mapa.set(data, nazwa);
  }
  return { ok: true, mapa };
}

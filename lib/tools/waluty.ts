import { tool } from "ai";
import { z } from "zod";
import { AGENT_LIMITS } from "../instructions";
import { getJson, teraz, TIMEZONE } from "./http";

// Dokumentacja: https://api.nbp.pl/ – /exchangerates/rates/{a|b}/{kod}/ zwraca ostatni opublikowany
// kurs średni ({ currency, code, rates: [{ no, effectiveDate, mid }] }), /tables/{a|b}/ – całą tabelę.
// W weekend i święta NBP nie publikuje – dostajemy ostatni dostępny kurs (data w dataPublikacji).

const NBP = "https://api.nbp.pl/api/exchangerates";

type NbpRate = { currency: string; code: string; mid: number };
type Kurs = { waluta: string; kod: string; mid: number; tabela: string; dataPublikacji: string };

// Pamięć kursów NBP (AGENT_NBP_CACHE_MINUTES). NBP publikuje kurs średni raz dziennie, więc kurs sprzed
// kilkudziesięciu minut to wciąż ten sam prawdziwy kurs. Zapamiętujemy też, KIEDY pobrano go z NBP.
const nbpCache = new Map<string, { kurs: Kurs; pobranoISO: string; wygasa: number }>();

async function znajdzKursNbp(
  waluta: string,
): Promise<{ ok: true; kurs: Kurs; zPamieciISO?: string } | { ok: false; blad: string }> {
  const klucz = waluta.trim().toLowerCase();
  const zapamietany = nbpCache.get(klucz);
  if (zapamietany && zapamietany.wygasa > Date.now()) {
    return { ok: true, kurs: zapamietany.kurs, zPamieciISO: zapamietany.pobranoISO };
  }
  const wynik = await znajdzKursNbpBezPamieci(waluta);
  if (wynik.ok && AGENT_LIMITS.nbpCacheMs > 0) {
    const wpis = { kurs: wynik.kurs, pobranoISO: new Date().toISOString(), wygasa: Date.now() + AGENT_LIMITS.nbpCacheMs };
    nbpCache.set(klucz, wpis);
    nbpCache.set(wynik.kurs.kod.toLowerCase(), wpis);
  }
  return wynik;
}

async function znajdzKursNbpBezPamieci(waluta: string): Promise<{ ok: true; kurs: Kurs } | { ok: false; blad: string }> {
  const input = waluta.trim();
  const NIE_ODPOWIADA = "Serwis NBP nie odpowiada. Spróbuj za chwilę.";

  // 1. Wygląda na kod ISO -> zapytanie o jedną walutę (najpierw tabela A, potem B).
  if (/^[a-zA-Z]{3}$/.test(input)) {
    let serwisNieOdpowiada = false;
    for (const table of ["a", "b"]) {
      const res = await getJson(`${NBP}/rates/${table}/${input.toLowerCase()}/?format=json`);
      if (res.ok && res.data) {
        const rate = res.data.rates?.[0];
        return {
          ok: true,
          kurs: {
            waluta: res.data.currency,
            kod: res.data.code,
            mid: rate?.mid,
            tabela: `${table.toUpperCase()} ${rate?.no ?? ""}`.trim(),
            dataPublikacji: rate?.effectiveDate,
          },
        };
      }
      // Tabela B ma sens tylko, gdy w A nie ma waluty (404). Błąd serwera = NBP nie odpowiada –
      // nie czekamy na drugie, też nieudane zapytanie.
      if (!res.ok && res.status !== 404) {
        serwisNieOdpowiada = true;
        break;
      }
    }
    if (serwisNieOdpowiada) return { ok: false, blad: NIE_ODPOWIADA };
    // 404 – może to nazwa (np. „jen”), szukamy dalej po nazwie.
  }

  // 2. Szukanie po nazwie w aktualnych tabelach A i B.
  const szukane = input.toLowerCase();
  for (const table of ["a", "b"]) {
    const res = await getJson(`${NBP}/tables/${table}/?format=json`);
    if (!res.ok) return { ok: false, blad: NIE_ODPOWIADA };
    const t = res.data?.[0];
    const rates: NbpRate[] = t?.rates ?? [];
    const hit =
      rates.find((r) => r.code.toLowerCase() === szukane) ??
      rates.find((r) => r.currency.toLowerCase() === szukane) ??
      rates.find((r) => r.currency.toLowerCase().includes(szukane));
    if (hit) {
      return {
        ok: true,
        kurs: {
          waluta: hit.currency,
          kod: hit.code,
          mid: hit.mid,
          tabela: `${table.toUpperCase()} ${t.no}`,
          dataPublikacji: t.effectiveDate,
        },
      };
    }
  }
  return { ok: false, blad: `NBP nie publikuje kursu dla „${waluta}”. Podaj kod waluty, np. EUR.` };
}

const pln = (n: number) =>
  n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const waluty = tool({
  description:
    "Kurs średni waluty wobec złotego (PLN) z API NBP i opcjonalnie przeliczenie kwoty. " +
    "Użyj przy pytaniach o kurs walut albo „ile złotych to X euro” / „ile euro dostanę za X zł”. " +
    "Przyjmuje kod (EUR, USD, CHF) albo polską nazwę („euro”, „frank szwajcarski”). " +
    "Podaj kwotę i kierunek: naPLN (kwota w walucie → złote) albo zPLN (kwota w złotych → waluta). " +
    "Zwraca ostatni opublikowany kurs (w weekend – z ostatniego dnia roboczego).",
  inputSchema: z.object({
    waluta: z.string().min(2).max(40).describe("Kod ISO (EUR, USD, GBP…) albo polska nazwa waluty"),
    kwota: z.number().positive().max(1e12).optional().describe("Kwota do przeliczenia (opcjonalnie)"),
    kierunek: z
      .enum(["naPLN", "zPLN"])
      .optional()
      .describe("naPLN: kwota jest w walucie, wynik w złotych; zPLN: kwota jest w złotych, wynik w walucie"),
  }),
  execute: async ({ waluta, kwota, kierunek = "naPLN" }) => {
    const pobrano = teraz();
    const found = await znajdzKursNbp(waluta);
    if (!found.ok) return { blad: found.blad, pobrano };
    const { kurs } = found;

    const wynik: Record<string, unknown> = {
      waluta: kurs.waluta,
      kod: kurs.kod,
      kursSredniPLN: kurs.mid,
      opis: `1 ${kurs.kod} = ${kurs.mid} PLN (kurs średni NBP)`,
      tabela: kurs.tabela,
      dataPublikacji: kurs.dataPublikacji,
      // Kurs z pamięci podręcznej: kiedy naprawdę pobrano go z NBP.
      ...(found.zPamieciISO
        ? {
            zPamieci: true,
            pobranoZNbpISO: found.zPamieciISO,
            uwaga: `Kurs z pamięci podręcznej – pobrany z NBP ${new Date(found.zPamieciISO).toLocaleString("pl-PL", { timeZone: TIMEZONE })}.`,
          }
        : {}),
    };

    if (kwota !== undefined) {
      if (kierunek === "naPLN") {
        const wynikPLN = Math.round(kwota * kurs.mid * 100) / 100;
        wynik.przeliczenie = { kwota, z: kurs.kod, na: "PLN", wynik: wynikPLN, zapis: `${pln(kwota)} ${kurs.kod} = ${pln(wynikPLN)} PLN` };
      } else {
        const wynikWal = Math.round((kwota / kurs.mid) * 100) / 100;
        wynik.przeliczenie = { kwota, z: "PLN", na: kurs.kod, wynik: wynikWal, zapis: `${pln(kwota)} PLN = ${pln(wynikWal)} ${kurs.kod}` };
      }
    }

    return { ...wynik, zrodlo: "Narodowy Bank Polski (api.nbp.pl)", pobrano };
  },
});

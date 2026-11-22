// Asystent podróży – pobieranie danych do kart. Te same funkcje co narzędzia agenta (lib/tools/):
// wywołujemy ich execute bezpośrednio, bez modelu. Każde źródło osobno – awaria jednego nie psuje reszty.
import { pogoda, strefaCzasowa, swieta, waluty, wikipedia, znajdzMiejsce } from "./tools";
import {
  CURRENCY_BY_COUNTRY,
  firstSentences,
  upcomingHolidays,
  type TravelCard,
  type TravelSource,
} from "./travel";

// Ile najdłużej czeka jedna karta dashboardu – po tym czasie „Brak danych”.
const CARD_TIMEOUT_MS = 15_000;

type Out = Record<string, unknown> & { blad?: string; zrodlo?: string };

// execute narzędzia jak w pętli agenta, ale bez modelu.
async function run(t: { execute?: unknown }, input: unknown): Promise<Out> {
  const execute = t.execute as (input: unknown, options: unknown) => Promise<Out>;
  return execute(input, { toolCallId: "dashboard", messages: [] });
}

const num = (v: unknown, digits = 1) =>
  typeof v === "number" ? v.toLocaleString("pl-PL", { maximumFractionDigits: digits }) : null;

const fail = (source: string, reason: string): TravelCard => ({
  ok: false,
  reason,
  source,
  fetchedAt: new Date().toISOString(),
});

const ok = (source: string, value: string, details: string[], link?: string, fetchedAt?: string): TravelCard => ({
  ok: true,
  value,
  details: details.filter(Boolean),
  ...(link ? { link } : {}),
  source,
  // Godzina FAKTYCZNEGO pobrania ze źródła (przy pamięci podręcznej – starsza niż kliknięcie).
  fetchedAt: fetchedAt ?? new Date().toISOString(),
});

async function pogodaCard(miasto: string, data: string): Promise<TravelCard> {
  const src = "Open-Meteo (open-meteo.com)";
  const r = await run(pogoda, { miasto, data });
  if (r.blad) return fail(src, r.blad);
  const min = num(r.temperaturaMinC);
  const max = num(r.temperaturaMaxC);
  if (min === null || max === null) return fail(src, "Open-Meteo nie zwrócił temperatury na ten dzień.");
  return ok(String(r.zrodlo ?? src), `${min}…${max} °C, ${r.opis}`, [
    num(r.szansaOpadowProc, 0) !== null ? `szansa opadów: ${num(r.szansaOpadowProc, 0)}%` : "",
    num(r.wiatrMaxKmH) !== null ? `wiatr do ${num(r.wiatrMaxKmH)} km/h` : "",
    `${r.lokalizacja}, ${data}`,
  ]);
}

async function walutyCard(miasto: string): Promise<TravelCard> {
  const src = "Narodowy Bank Polski (api.nbp.pl)";
  const m = await znajdzMiejsce(miasto);
  if (!m.ok) return fail(src, m.blad);
  const kod = CURRENCY_BY_COUNTRY[m.kodKraju];
  if (!kod) return fail(src, `Nie znam waluty kraju ${m.kraj} (${m.kodKraju}).`);
  if (kod === "PLN") {
    return ok("ISO 4217 – waluta kraju", "PLN – waluta krajowa", [`${m.kraj}: nie trzeba wymieniać pieniędzy`]);
  }
  const r = await run(waluty, { waluta: kod });
  if (r.blad) return fail(src, r.blad);
  const zPamieci = r.zPamieci === true && typeof r.pobranoZNbpISO === "string";
  return ok(
    String(r.zrodlo ?? src) + (zPamieci ? " – z pamięci podręcznej" : ""),
    `1 ${r.kod} = ${num(r.kursSredniPLN, 4)} PLN`,
    [`${r.waluta} (${m.kraj})`, `kurs średni NBP z dnia ${r.dataPublikacji}`],
    undefined,
    zPamieci ? (r.pobranoZNbpISO as string) : undefined,
  );
}

async function swietaCard(miasto: string, data: string): Promise<TravelCard> {
  const src = "Nager.Date (date.nager.at)";
  const m = await znajdzMiejsce(miasto);
  if (!m.ok) return fail(src, m.blad);
  const rok = Number(data.slice(0, 4));
  type Swieto = { data: string; dzienTygodnia: string; nazwa: string; tylkoRegiony?: string[] };
  const lista: Swieto[] = [];
  // Rok podróży, a gdy w nim za mało – także następny (np. wyjazd w grudniu).
  for (const r of [rok, rok + 1]) {
    const res = await run(swieta, { kraj: m.kodKraju, rok: r });
    if (res.blad) return fail(src, res.blad);
    lista.push(...((res.swieta as Swieto[]) ?? []));
    if (upcomingHolidays(lista, data).length >= 3) break;
  }
  const najblizsze = upcomingHolidays(lista, data);
  if (najblizsze.length === 0) {
    return ok(src, "brak dni wolnych", [`${m.kraj}: Nager.Date nie podaje świąt po ${data}`]);
  }
  const fmt = (s: Swieto) =>
    `${new Date(`${s.data}T12:00:00Z`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" })} (${s.dzienTygodnia}) – ${s.nazwa}${s.tylkoRegiony?.length ? " (tylko niektóre regiony)" : ""}`;
  return ok(src, `najbliższy: ${fmt(najblizsze[0])}`, [...najblizsze.slice(1).map(fmt), `kraj: ${m.kraj}`]);
}

async function wikipediaCard(miasto: string): Promise<TravelCard> {
  const src = "Wikipedia (pl.wikipedia.org), CC BY-SA";
  const r = await run(wikipedia, { haslo: miasto });
  if (r.blad) return fail(src, r.blad);
  const zdania = firstSentences(String(r.streszczenie ?? ""), 2);
  if (!zdania) return fail(src, "Wikipedia nie zwróciła opisu.");
  return ok(src, String(r.tytul), [zdania], typeof r.link === "string" ? r.link : undefined);
}

async function czasCard(miasto: string): Promise<TravelCard> {
  const src = "Open-Meteo Geocoding (open-meteo.com) + zegar serwera";
  const r = await run(strefaCzasowa, { miasto });
  if (r.blad) return fail(src, r.blad);
  return ok(src, `${r.godzina} (${r.przesuniecieUTC})`, [
    `różnica względem Polski: ${r.roznicaWzgledemPolski}`,
    `${r.dzienTygodnia}, ${r.data} · strefa ${r.strefa}`,
  ]);
}

/** Jedna karta. Nigdy nie rzuca: błąd albo przekroczony czas = „Brak danych” z powodem. */
export async function fetchTravelCard(source: TravelSource, miasto: string, data: string): Promise<TravelCard> {
  // Limit całej karty (kilka zapytań, np. geokodowanie + NBP, każde z ponowieniem).
  const timeoutMs = CARD_TIMEOUT_MS;
  const task = {
    pogoda: () => pogodaCard(miasto, data),
    waluty: () => walutyCard(miasto),
    swieta: () => swietaCard(miasto, data),
    wikipedia: () => wikipediaCard(miasto),
    czas: () => czasCard(miasto),
  }[source];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<TravelCard>((resolve) => {
        timer = setTimeout(
          () => resolve(fail("—", `Źródło nie odpowiada (brak odpowiedzi w ${Math.round(timeoutMs / 1000)} s).`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    console.error(`[api/dashboard ${source}]`, error);
    return fail("—", "Źródło nie odpowiada (błąd połączenia).");
  } finally {
    clearTimeout(timer);
  }
}

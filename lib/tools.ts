import { tool } from "ai";
import { z } from "zod";
import { AGENT_LIMITS } from "./instructions";

// ---------- Wspólne pomocnicze ----------

const TIMEZONE = "Europe/Warsaw";
// Ile czekamy na odpowiedź API (AGENT_TOOL_TIMEOUT_SECONDS, domyślnie 10 s).
const TIMEOUT_MS = AGENT_LIMITS.toolTimeoutMs;

function teraz() {
  return new Date().toLocaleString("pl-PL", { timeZone: TIMEZONE });
}

// Pobiera JSON z publicznego API. Nie rzuca wyjątków – zwraca { ok, ... }.
async function getJson(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: true; data: any } | { ok: false; status?: number; reason?: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json", ...extraHeaders },
      cache: "no-store",
    });
    if (res.status === 204) return { ok: true, data: null };
    if (!res.ok) {
      let reason: string | undefined;
      try {
        reason = (await res.json())?.reason;
      } catch {}
      return { ok: false, status: res.status, reason };
    }
    return { ok: true, data: await res.json() };
  } catch (error) {
    console.error("[tools] fetch", url, error);
    return { ok: false };
  }
}

// ---------- Pogoda (Open-Meteo) ----------

// Kody pogody WMO -> opis po polsku (https://open-meteo.com/en/docs).
const WMO: Record<number, string> = {
  0: "bezchmurnie", 1: "przeważnie pogodnie", 2: "częściowe zachmurzenie", 3: "pochmurno",
  45: "mgła", 48: "mgła osadzająca szadź",
  51: "lekka mżawka", 53: "mżawka", 55: "gęsta mżawka", 56: "marznąca mżawka", 57: "gęsta marznąca mżawka",
  61: "lekki deszcz", 63: "deszcz", 65: "ulewny deszcz", 66: "marznący deszcz", 67: "silny marznący deszcz",
  71: "lekki śnieg", 73: "śnieg", 75: "intensywny śnieg", 77: "ziarna śniegu",
  80: "przelotny deszcz", 81: "przelotne opady deszczu", 82: "gwałtowne ulewy",
  85: "przelotny śnieg", 86: "intensywne opady śniegu",
  95: "burza", 96: "burza z gradem", 99: "silna burza z gradem",
};
const opis = (code: unknown) =>
  typeof code === "number" ? (WMO[code] ?? `kod pogody ${code}`) : "brak danych";

export const pogoda = tool({
  description:
    "Pobiera prognozę albo aktualną pogodę dla miasta z publicznego API Open-Meteo. " +
    "Użyj przy pytaniach o pogodę, temperaturę, deszcz, wiatr. " +
    "Bez daty zwraca pogodę teraz. Z datą (RRRR-MM-DD, maks. 15 dni naprzód) – prognozę na ten dzień, " +
    "a z godziną – także na tę godzinę. Gdy użytkownik mówi „jutro”, „w sobotę” itp., " +
    "najpierw ustal datę narzędziem czas.",
  inputSchema: z.object({
    miasto: z.string().min(2).describe("Nazwa miasta, np. „Kraków” albo „Gdańsk”"),
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Dzień prognozy RRRR-MM-DD. Pomiń dla pogody teraz."),
    godzina: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .describe("Godzina GG:MM (czas polski), tylko razem z datą."),
  }),
  execute: async ({ miasto, data, godzina }) => {
    const pobrano = teraz();

    // 1. Miasto -> współrzędne (Geocoding API).
    const geo = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(miasto)}&count=1&language=pl&format=json`,
    );
    if (!geo.ok) {
      return { blad: "Serwis pogody (Open-Meteo) nie odpowiada. Spróbuj za chwilę.", pobrano };
    }
    const miejsce = geo.data?.results?.[0];
    if (!miejsce) {
      return { blad: `Nie znalazłem miejscowości „${miasto}”.`, pobrano };
    }

    // 2. Prognoza.
    const params = new URLSearchParams({
      latitude: String(miejsce.latitude),
      longitude: String(miejsce.longitude),
      timezone: TIMEZONE,
    });
    if (data) {
      params.set("start_date", data);
      params.set("end_date", data);
      params.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
      );
      if (godzina) {
        params.set("hourly", "temperature_2m,weather_code,precipitation_probability,wind_speed_10m");
      }
    } else {
      params.set("current", "temperature_2m,weather_code,precipitation,wind_speed_10m");
    }

    const res = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) {
      return {
        blad:
          res.status === 400
            ? `Open-Meteo nie ma prognozy dla tej daty (prognoza sięga maks. 15 dni naprzód).`
            : "Serwis pogody (Open-Meteo) nie odpowiada. Spróbuj za chwilę.",
        pobrano,
      };
    }

    const lokalizacja = [miejsce.name, miejsce.admin1, miejsce.country].filter(Boolean).join(", ");
    const zrodlo = "Open-Meteo (open-meteo.com)";
    const d = res.data;

    if (!data) {
      const c = d.current ?? {};
      return {
        lokalizacja,
        czas: c.time,
        opis: opis(c.weather_code),
        temperaturaC: c.temperature_2m,
        opadMm: c.precipitation,
        wiatrKmH: c.wind_speed_10m,
        zrodlo,
        pobrano,
      };
    }

    const day = d.daily ?? {};
    const wynik: Record<string, unknown> = {
      lokalizacja,
      data,
      opis: opis(day.weather_code?.[0]),
      temperaturaMinC: day.temperature_2m_min?.[0],
      temperaturaMaxC: day.temperature_2m_max?.[0],
      szansaOpadowProc: day.precipitation_probability_max?.[0],
      wiatrMaxKmH: day.wind_speed_10m_max?.[0],
    };

    if (godzina && d.hourly?.time) {
      const target = `${data}T${godzina.slice(0, 2)}:00`;
      const i = d.hourly.time.indexOf(target);
      if (i >= 0) {
        wynik.oGodzinie = {
          godzina: `${godzina.slice(0, 2)}:00`,
          opis: opis(d.hourly.weather_code?.[i]),
          temperaturaC: d.hourly.temperature_2m?.[i],
          szansaOpadowProc: d.hourly.precipitation_probability?.[i],
          wiatrKmH: d.hourly.wind_speed_10m?.[i],
        };
      }
    }

    return { ...wynik, zrodlo, pobrano };
  },
});

// ---------- Waluty (NBP): kurs wobec PLN + przeliczenie kwoty ----------
// Dokumentacja: https://api.nbp.pl/ – /exchangerates/rates/{a|b}/{kod}/ zwraca ostatni opublikowany
// kurs średni ({ currency, code, rates: [{ no, effectiveDate, mid }] }), /tables/{a|b}/ – całą tabelę.
// W weekend i święta NBP nie publikuje – dostajemy ostatni dostępny kurs (data w dataPublikacji).

const NBP = "https://api.nbp.pl/api/exchangerates";

type NbpRate = { currency: string; code: string; mid: number };
type Kurs = { waluta: string; kod: string; mid: number; tabela: string; dataPublikacji: string };

async function znajdzKursNbp(waluta: string): Promise<{ ok: true; kurs: Kurs } | { ok: false; blad: string }> {
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
      if (!res.ok && res.status !== 404) serwisNieOdpowiada = true;
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

// ---------- Kursy kryptowalut (CoinGecko) ----------

// Publiczne API bez klucza: https://docs.coingecko.com/docs/keyless-public-api
// Opcjonalnie: darmowy klucz Demo w .env.local jako COINGECKO_DEMO_API_KEY (wyższy limit).
const COINGECKO = "https://api.coingecko.com/api/v3/simple/price";

const zaokr = (n: unknown, miejsca: number) =>
  typeof n === "number" ? Number(n.toFixed(miejsca)) : null;

export const kursKrypto = tool({
  description:
    "Pobiera aktualną cenę kryptowaluty w PLN i USD oraz zmianę z 24 h z publicznego API CoinGecko. " +
    "Użyj przy pytaniach o cenę lub kurs kryptowalut (bitcoin, ethereum, solana…). " +
    "Przyjmuje symbol (BTC, ETH), nazwę (Bitcoin) albo identyfikator CoinGecko (bitcoin).",
  inputSchema: z.object({
    kryptowaluta: z
      .string()
      .min(2)
      .max(40)
      .describe("Symbol (BTC), nazwa (Bitcoin) albo identyfikator CoinGecko (bitcoin)"),
  }),
  execute: async ({ kryptowaluta }) => {
    const pobrano = teraz();
    const zrodlo = "CoinGecko (coingecko.com)";
    const input = kryptowaluta.trim();

    const apiKey = process.env.COINGECKO_DEMO_API_KEY;
    const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};

    // Próbujemy po kolei: identyfikator -> symbol -> nazwa.
    const proby: [string, string][] = [
      ["ids", input.toLowerCase().replace(/\s+/g, "-")],
      ["symbols", input.toLowerCase()],
      ["names", input],
    ];

    for (const [param, value] of proby) {
      const params = new URLSearchParams({
        [param]: value,
        vs_currencies: "pln,usd",
        include_24hr_change: "true",
        include_last_updated_at: "true",
      });
      const res = await getJson(`${COINGECKO}?${params}`, headers);

      if (!res.ok) {
        return {
          blad:
            res.status === 429
              ? "CoinGecko: przekroczony limit zapytań. Spróbuj za minutę."
              : "Serwis CoinGecko nie odpowiada. Spróbuj za chwilę.",
          pobrano,
        };
      }

      const entries = Object.entries(res.data ?? {}) as [string, any][];
      const [id, d] = entries[0] ?? [];
      if (id && d && typeof d.pln === "number") {
        return {
          kryptowaluta: id,
          cenaPLN: zaokr(d.pln, 2),
          cenaUSD: zaokr(d.usd, 2),
          zmiana24hProc: zaokr(d.pln_24h_change, 2),
          aktualizacja:
            typeof d.last_updated_at === "number"
              ? new Date(d.last_updated_at * 1000).toLocaleString("pl-PL", { timeZone: TIMEZONE })
              : null,
          zrodlo,
          pobrano,
        };
      }
    }

    return {
      blad: `CoinGecko nie zna kryptowaluty „${kryptowaluta}”. Podaj symbol (np. BTC) albo nazwę (np. Ethereum).`,
      pobrano,
    };
  },
});

// ---------- Czas i strefy czasowe ----------

// Przesunięcie strefy względem UTC w minutach (z formatu „GMT+01:00”).
function offsetMinut(timeZone: string, date: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const minuty = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minuty : minuty;
}

function poprawnaStrefa(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function opisRoznicy(minuty: number): string {
  if (minuty === 0) return "ta sama godzina co w Polsce";
  const h = Math.abs(minuty) / 60;
  const ile = Number.isInteger(h) ? `${h} h` : `${h.toFixed(1).replace(".", ",")} h`;
  return minuty > 0 ? `${ile} później niż w Polsce` : `${ile} wcześniej niż w Polsce`;
}

// Data, godzina i różnica względem Polski w podanej strefie.
function czasWStrefie(timeZone: string, now = new Date()) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pl-PL", { timeZone, ...options }).format(now);
  const off = offsetMinut(timeZone, now);
  const offPolska = offsetMinut(TIMEZONE, now);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return {
    data: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(now), // RRRR-MM-DD
    dzienTygodnia: part({ weekday: "long" }),
    godzina: part({ hour: "2-digit", minute: "2-digit" }),
    strefa: timeZone,
    przesuniecieUTC: `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`,
    roznicaWzgledemPolski: opisRoznicy(off - offPolska),
  };
}

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

const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

type Strefa =
  | { ok: true; lokalizacja: string; timeZone: string; tylkoKraj: boolean }
  | { ok: false; blad: string };

// Miasto i/lub kraj -> strefa IANA (geokodowanie Open-Meteo). Wspólne dla strefaCzasowa i przeliczCzas.
async function ustalStrefe(miasto?: string, kraj?: string): Promise<Strefa> {
  const nazwa = (miasto ?? kraj ?? "").trim();
  if (!nazwa) return { ok: false, blad: "Podaj miasto, kraj albo oba." };

  const geo = await getJson(`${GEOCODING}?name=${encodeURIComponent(nazwa)}&count=10&language=pl&format=json`);
  if (!geo.ok) return { ok: false, blad: "Serwis geokodowania (Open-Meteo) nie odpowiada. Spróbuj za chwilę." };

  type Miejsce = {
    name: string; latitude: number; longitude: number; feature_code?: string;
    country?: string; country_code?: string; admin1?: string; timezone?: string | null;
  };
  let wyniki: Miejsce[] = geo.data?.results ?? [];

  if (miasto && kraj) {
    const k = kraj.trim().toLowerCase();
    wyniki = wyniki.filter((r) => r.country_code?.toLowerCase() === k || r.country?.toLowerCase().includes(k));
  } else if (!miasto) {
    // Sam kraj: najpierw obiekt typu „państwo” (feature_code PCL…), jeśli jest.
    wyniki = [...wyniki.filter((r) => r.feature_code?.startsWith("PCL")), ...wyniki];
  }

  const miejsce = wyniki[0];
  if (!miejsce) {
    return {
      ok: false,
      blad: miasto && kraj ? `Nie znalazłem miejscowości „${miasto}” w kraju „${kraj}”.` : `Nie znalazłem miejsca „${nazwa}”.`,
    };
  }

  // Państwo (np. „Portugalia”) nie ma strefy w geokodowaniu – bierzemy ją z prognozy dla jego środka.
  let timeZone = miejsce.timezone ?? null;
  if (!timeZone) {
    const f = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${miejsce.latitude}&longitude=${miejsce.longitude}&timezone=auto&current=temperature_2m`,
    );
    timeZone = f.ok ? (f.data?.timezone ?? null) : null;
  }
  if (!timeZone || !poprawnaStrefa(timeZone)) {
    return { ok: false, blad: `Nie udało się ustalić strefy czasowej dla „${nazwa}”.` };
  }

  const panstwo = miejsce.feature_code?.startsWith("PCL") ?? false;
  return {
    ok: true,
    lokalizacja: [...new Set([miejsce.name, panstwo ? null : miejsce.admin1, panstwo ? null : miejsce.country].filter(Boolean))].join(", "),
    timeZone,
    tylkoKraj: !miasto || panstwo,
  };
}

const UWAGA_KRAJ = "Strefa dla środka kraju. Duże kraje (np. USA, Rosja, Brazylia, Australia) mają kilka stref – podaj miasto.";

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

// ---------- Przeliczanie czasu między miejscami ----------

// Lokalny czas „ścienny” w strefie -> chwila w UTC (dwie iteracje wystarczą także przy zmianie czasu).
function lokalnyNaUTC(data: string, godzina: string, timeZone: string): Date {
  const [y, mo, d] = data.split("-").map(Number);
  const [h, mi] = godzina.split(":").map(Number);
  const naiwny = Date.UTC(y, mo - 1, d, h, mi);
  let t = naiwny - offsetMinut(timeZone, new Date(naiwny)) * 60000;
  t = naiwny - offsetMinut(timeZone, new Date(t)) * 60000;
  return new Date(t);
}

function wStrefie(chwila: Date, timeZone: string) {
  return {
    data: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(chwila),
    dzienTygodnia: new Intl.DateTimeFormat("pl-PL", { timeZone, weekday: "long" }).format(chwila),
    godzina: new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(chwila),
  };
}

// Miejsce: strefa IANA („Europe/Lisbon”), „miasto, kraj” albo sama nazwa miasta/kraju.
async function ustalMiejsce(miejsce: string): Promise<Strefa> {
  const m = miejsce.trim();
  if (m.includes("/") && poprawnaStrefa(m)) return { ok: true, lokalizacja: m, timeZone: m, tylkoKraj: false };
  if (/^polska$|^pl$/i.test(m)) return { ok: true, lokalizacja: "Polska", timeZone: TIMEZONE, tylkoKraj: false };
  const [miasto, kraj] = m.split(",").map((x) => x.trim());
  return ustalStrefe(miasto, kraj || undefined);
}

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

// ---------- Święta (Nager.Date) ----------
// Dokumentacja: https://date.nager.at/Api – /api/v3/AvailableCountries → [{ countryCode, name }],
// /api/v3/PublicHolidays/{rok}/{kod} → [{ date, localName, name, countryCode, global, counties, types }].
// 404 = nieznany kraj, 204 = brak danych.

const NAGER = "https://date.nager.at/api/v3";
const nazwyKrajow = new Intl.DisplayNames(["pl"], { type: "region" });

async function kodKraju(kraj: string): Promise<{ ok: true; kod: string } | { ok: false; blad: string }> {
  const input = kraj.trim();
  if (/^[a-zA-Z]{2}$/.test(input)) return { ok: true, kod: input.toUpperCase() };

  const res = await getJson(`${NAGER}/AvailableCountries`);
  if (!res.ok) return { ok: false, blad: "Serwis świąt (Nager.Date) nie odpowiada. Spróbuj za chwilę." };
  const kraje: { countryCode: string; name: string }[] = res.data ?? [];
  const szukane = input.toLowerCase();
  const nazwy = (c: { countryCode: string; name: string }) => [
    c.name.toLowerCase(),
    (nazwyKrajow.of(c.countryCode) ?? "").toLowerCase(),
  ];
  const hit =
    kraje.find((c) => nazwy(c).includes(szukane)) ??
    kraje.find((c) => nazwy(c).some((n) => n.startsWith(szukane) || szukane.startsWith(n)));
  if (!hit) return { ok: false, blad: `Nager.Date nie ma danych dla kraju „${kraj}”. Podaj kod kraju, np. PT.` };
  return { ok: true, kod: hit.countryCode };
}

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

// ---------- Dni robocze (weekendy + święta z Nager.Date) ----------

// Ogólnokrajowe dni wolne od pracy w danym roku: mapa „RRRR-MM-DD” -> nazwa.
async function swietaWRoku(kod: string, rok: number): Promise<{ ok: true; mapa: Map<string, string> } | { ok: false; blad: string }> {
  const res = await getJson(`${NAGER}/PublicHolidays/${rok}/${kod}`);
  if (!res.ok) {
    return {
      ok: false,
      blad: res.status === 404 ? `Nager.Date nie zna kraju o kodzie ${kod}.` : "Serwis świąt (Nager.Date) nie odpowiada. Spróbuj za chwilę.",
    };
  }
  type S = { date: string; localName: string; global: boolean; types?: string[] };
  const mapa = new Map<string, string>();
  for (const s of (res.data ?? []) as S[]) {
    if (s.global && (!s.types || s.types.includes("Public"))) mapa.set(s.date, s.localName);
  }
  return { ok: true, mapa };
}

const dodajDni = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dzienTyg = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pl-PL", { weekday: "long", timeZone: "UTC" });
const weekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());

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
    const zrodlo = "Nager.Date (date.nager.at) – święta ogólnokrajowe";
    if (Number.isNaN(Date.parse(`${od}T12:00:00Z`)) || (doDaty && Number.isNaN(Date.parse(`${doDaty}T12:00:00Z`)))) {
      return { blad: "Nieprawidłowa data – użyj formatu RRRR-MM-DD.", pobrano };
    }

    const kod = await kodKraju(kraj);
    if (!kod.ok) return { blad: kod.blad, pobrano };

    // Święta pobieramy dla każdego roku, który obejmuje zakres (wczytywane leniwie).
    const lata = new Map<number, Map<string, string>>();
    const swieto = async (iso: string): Promise<string | null | { blad: string }> => {
      const rok = Number(iso.slice(0, 4));
      if (!lata.has(rok)) {
        const r = await swietaWRoku(kod.kod, rok);
        if (!r.ok) return { blad: r.blad };
        lata.set(rok, r.mapa);
      }
      return lata.get(rok)!.get(iso) ?? null;
    };

    const pominieteSwieta: { data: string; nazwa: string }[] = [];
    let weekendy = 0;
    const roboczy = async (iso: string): Promise<boolean | { blad: string }> => {
      if (weekend(iso)) { weekendy++; return false; }
      const s = await swieto(iso);
      if (s && typeof s === "object") return s;
      if (s) { pominieteSwieta.push({ data: iso, nazwa: s }); return false; }
      return true;
    };

    const kraju = nazwyKrajow.of(kod.kod) ?? kod.kod;

    if (dni !== undefined) {
      // Tryb 1: liczymy od dnia następnego (poprzedniego) po dacie „od”.
      const krok = dni >= 0 ? 1 : -1;
      let data = od;
      let zostalo = Math.abs(dni);
      while (zostalo > 0) {
        data = dodajDni(data, krok);
        const r = await roboczy(data);
        if (typeof r === "object") return { blad: r.blad, pobrano };
        if (r) zostalo--;
      }
      return {
        tryb: "data ± dni robocze",
        kraj: kraju,
        od, odDzien: dzienTyg(od),
        dniRobocze: dni,
        wynik: data, wynikDzien: dzienTyg(data),
        pominieteWeekendy: weekendy,
        pominieteSwieta,
        zrodlo, pobrano,
      };
    }

    // Tryb 2: zliczanie w przedziale [od, do] włącznie.
    let [a, b] = [od, doDaty!];
    const odwrotnie = a > b;
    if (odwrotnie) [a, b] = [b, a];
    if ((Date.parse(b) - Date.parse(a)) / 86400000 > 3660) return { blad: "Zakres może mieć najwyżej 10 lat.", pobrano };
    let licznik = 0;
    for (let d = a; d <= b; d = dodajDni(d, 1)) {
      const r = await roboczy(d);
      if (typeof r === "object") return { blad: r.blad, pobrano };
      if (r) licznik++;
    }
    return {
      tryb: "liczba dni roboczych (włącznie z obiema datami)",
      kraj: kraju,
      od: a, do: b,
      dniRobocze: licznik,
      dniKalendarzowe: (Date.parse(b) - Date.parse(a)) / 86400000 + 1,
      weekendy,
      swieta: pominieteSwieta,
      zrodlo, pobrano,
    };
  },
});

// ---------- Firma (Biała lista podatników VAT, Ministerstwo Finansów) ----------
// Dokumentacja: https://wl-api.mf.gov.pl/ – /api/search/{nip|regon|bank-account}/{wartość}?date=RRRR-MM-DD
// → { result: { subject: { name, nip, regon, krs, statusVat, residenceAddress, workingAddress,
//   accountNumbers, registrationLegalDate, … } | null, requestDateTime, requestId } }.
// Błędy: 400 { code: "WL-1xx", message } (np. zły NIP). API ma dzienny limit zapytań (429 po przekroczeniu).

const MF = "https://wl-api.mf.gov.pl/api/search";
const tylkoCyfry = (s: string) => s.replace(/[\s-]/g, "").replace(/^PL/i, "");

function poprawnyNip(nip: string) {
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const suma = w.reduce((s, x, i) => s + x * Number(nip[i]), 0);
  return suma % 11 === Number(nip[9]);
}

export const firma = tool({
  description:
    "Dane firmy z oficjalnej Białej listy podatników VAT (Ministerstwo Finansów): nazwa, NIP, REGON, KRS, status VAT, " +
    "adres i liczba rachunków na liście. Wyszukiwanie po NIP, REGON albo numerze rachunku bankowego (26 cyfr). " +
    "Użyj, gdy trzeba sprawdzić kontrahenta, klienta, dostawcę albo numer konta przed przelewem. Działa tylko dla firm z Polski.",
  inputSchema: z.object({
    szukaj: z.enum(["nip", "regon", "rachunek"]).describe("Po czym szukać"),
    wartosc: z.string().min(9).max(40).describe("NIP (10 cyfr), REGON (9 lub 14 cyfr) albo rachunek (26 cyfr); spacje i myślniki dozwolone"),
  }),
  execute: async ({ szukaj, wartosc }) => {
    const pobrano = teraz();
    const zrodlo = "Biała lista podatników VAT, Ministerstwo Finansów (wl-api.mf.gov.pl)";
    const v = tylkoCyfry(wartosc);

    if (szukaj === "nip" && !poprawnyNip(v)) return { blad: `„${wartosc}” to nie jest poprawny NIP (10 cyfr z prawidłową sumą kontrolną).`, pobrano };
    if (szukaj === "regon" && !/^(\d{9}|\d{14})$/.test(v)) return { blad: "REGON musi mieć 9 albo 14 cyfr.", pobrano };
    if (szukaj === "rachunek" && !/^\d{26}$/.test(v)) return { blad: "Numer rachunku musi mieć 26 cyfr (polski NRB).", pobrano };

    const dzis = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(new Date());
    const sciezka = { nip: "nip", regon: "regon", rachunek: "bank-account" }[szukaj];
    const res = await getJson(`${MF}/${sciezka}/${v}?date=${dzis}`);
    if (!res.ok) {
      if (res.status === 400) return { blad: "Ministerstwo Finansów odrzuciło zapytanie – sprawdź numer.", pobrano };
      if (res.status === 429) return { blad: "Wyczerpany dzienny limit zapytań do Białej listy. Spróbuj jutro.", pobrano };
      return { blad: "Serwis Białej listy (Ministerstwo Finansów) nie odpowiada. Spróbuj za chwilę.", pobrano };
    }

    // Wyszukiwanie po rachunku zwraca listę podmiotów; po NIP/REGON – jeden podmiot.
    const r = res.data?.result;
    const subject = r?.subject ?? r?.subjects?.[0] ?? null;
    if (!subject) {
      return {
        znaleziono: false,
        komunikat: `Brak podmiotu dla ${szukaj === "rachunek" ? "tego rachunku" : `${szukaj.toUpperCase()} ${v}`} na Białej liście (stan na ${dzis}). ` +
          "To nie znaczy, że firma nie istnieje – może nie być czynnym podatnikiem VAT.",
        zrodlo, pobrano,
      };
    }

    return {
      znaleziono: true,
      nazwa: subject.name,
      nip: subject.nip ?? null,
      regon: subject.regon ?? null,
      krs: subject.krs ?? null,
      statusVat: subject.statusVat ?? null, // „Czynny”, „Zwolniony”, „Niezarejestrowany”
      adres: subject.workingAddress ?? subject.residenceAddress ?? null,
      dataRejestracji: subject.registrationLegalDate ?? null,
      liczbaRachunkowNaLiscie: Array.isArray(subject.accountNumbers) ? subject.accountNumbers.length : 0,
      ...(szukaj === "rachunek" ? { rachunekNaLiscie: true } : {}),
      stanNaDzien: dzis,
      identyfikatorZapytania: r?.requestId ?? null,
      zrodlo, pobrano,
    };
  },
});

// ---------- Wikipedia (polska) ----------
// Dokumentacja: https://pl.wikipedia.org/api/rest_v1/ – /page/summary/{tytuł} → { type, title, extract,
// content_urls.desktop.page }; wyszukiwanie: /w/api.php?action=query&list=search&srsearch=…
// Wikimedia wymaga identyfikującego nagłówka User-Agent.

const WIKI_HEADERS = {
  "user-agent": "StudioNovaChatbot/1.0 (https://nextjs-agent-five.vercel.app; kurs LABA)",
  "api-user-agent": "StudioNovaChatbot/1.0 (https://nextjs-agent-five.vercel.app; kurs LABA)",
};

function skrocTekst(text: string, max = 700): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const kropka = cut.lastIndexOf(". ");
  return (kropka > max * 0.5 ? cut.slice(0, kropka + 1) : cut) + " …";
}

export const wikipedia = tool({
  description:
    "Krótkie streszczenie hasła z polskiej Wikipedii z linkiem do artykułu. " +
    "Użyj przy pytaniach „co to jest…”, „kim był…”, „opowiedz o…” (miasta, osoby, pojęcia, historia). " +
    "Do aktualnych wiadomości i cen używaj wyszukajWInternecie.",
  inputSchema: z.object({
    haslo: z.string().min(1).max(120).describe("Hasło do wyszukania, np. „Lizbona”"),
  }),
  execute: async ({ haslo }) => {
    const pobrano = teraz();
    const zrodlo = "Wikipedia, wolna encyklopedia (pl.wikipedia.org), licencja CC BY-SA";
    const NIE_ODPOWIADA = "Wikipedia nie odpowiada. Spróbuj za chwilę.";

    const summary = (title: string) =>
      getJson(
        `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/ /g, "_"))}`,
        WIKI_HEADERS,
      );

    let res = await summary(haslo);
    if (!res.ok && res.status === 404) {
      // Brak dokładnego tytułu – szukamy najlepszego dopasowania.
      const params = new URLSearchParams({
        action: "query", list: "search", srsearch: haslo, srlimit: "1", format: "json", origin: "*",
      });
      const search = await getJson(`https://pl.wikipedia.org/w/api.php?${params}`, WIKI_HEADERS);
      if (!search.ok) return { blad: NIE_ODPOWIADA, pobrano };
      const title = search.data?.query?.search?.[0]?.title;
      if (!title) return { blad: `Nie znalazłem w polskiej Wikipedii hasła „${haslo}”.`, pobrano };
      res = await summary(title);
    }
    if (!res.ok || !res.data) return { blad: NIE_ODPOWIADA, pobrano };

    const d = res.data;
    return {
      tytul: d.title,
      streszczenie: skrocTekst(String(d.extract ?? "")),
      link: d.content_urls?.desktop?.page ?? `https://pl.wikipedia.org/wiki/${encodeURIComponent(d.title)}`,
      ...(d.type === "disambiguation"
        ? { uwaga: "To strona ujednoznaczniająca – hasło ma kilka znaczeń. Doprecyzuj, o które chodzi." }
        : {}),
      zrodlo,
      pobrano,
    };
  },
});

// ---------- Kalkulator ----------
// Liczby przychodzą jako osobne argumenty – nigdy nie wykonujemy wpisanego wyrażenia/kodu.

const fmt = (n: number) => n.toLocaleString("pl-PL", { maximumFractionDigits: 10 });
const zaokr10 = (n: number) => Math.round(n * 1e10) / 1e10;

export const kalkulator = tool({
  description:
    "Dokładne obliczenia na liczbach – używaj zamiast liczenia w pamięci (ceny, budżety, przeliczenia, procenty). " +
    "Działania: dodawanie, odejmowanie (pierwsza minus kolejne), mnozenie, dzielenie (pierwsza przez kolejne), " +
    "potegowanie [podstawa, wykładnik], procent [ile procent, z czego], srednia, " +
    "sumaIloczynow – suma pozycji „liczba × razy”, np. 3 noclegi po 420 zł + 2 bilety po 389 zł.",
  inputSchema: z.object({
    dzialanie: z.enum([
      "dodawanie", "odejmowanie", "mnozenie", "dzielenie", "potegowanie", "procent", "srednia", "sumaIloczynow",
    ]),
    liczby: z
      .array(z.number().finite())
      .max(50)
      .optional()
      .describe("Liczby dla działania (wszystkie poza sumaIloczynow)"),
    pozycje: z
      .array(z.object({ razy: z.number().finite(), liczba: z.number().finite() }))
      .max(50)
      .optional()
      .describe("Tylko dla sumaIloczynow: np. [{ razy: 3, liczba: 420 }, { razy: 2, liczba: 389 }]"),
  }),
  execute: async ({ dzialanie, liczby = [], pozycje = [] }) => {
    const pobrano = teraz();
    const blad = (tekst: string) => ({ blad: tekst, pobrano });

    let wynik: number;
    let zapis: string;
    switch (dzialanie) {
      case "sumaIloczynow":
        if (pozycje.length === 0) return blad("Podaj pozycje „razy × liczba”.");
        wynik = pozycje.reduce((s, p) => s + p.razy * p.liczba, 0);
        zapis = pozycje.map((p) => `${fmt(p.razy)} × ${fmt(p.liczba)}`).join(" + ");
        break;
      case "potegowanie":
        if (liczby.length !== 2) return blad("Potęgowanie wymaga dokładnie dwóch liczb: podstawy i wykładnika.");
        wynik = liczby[0] ** liczby[1];
        zapis = `${fmt(liczby[0])} ^ ${fmt(liczby[1])}`;
        break;
      case "procent":
        if (liczby.length !== 2) return blad("Procent wymaga dwóch liczb: ile procent i z jakiej kwoty.");
        wynik = (liczby[0] / 100) * liczby[1];
        zapis = `${fmt(liczby[0])}% z ${fmt(liczby[1])}`;
        break;
      default: {
        if (liczby.length < (dzialanie === "srednia" ? 1 : 2)) return blad("Podaj co najmniej dwie liczby.");
        if (dzialanie === "dzielenie" && liczby.slice(1).some((n) => n === 0)) return blad("Nie można dzielić przez zero.");
        const znak = { dodawanie: " + ", odejmowanie: " − ", mnozenie: " × ", dzielenie: " ÷ ", srednia: ", " }[dzialanie];
        const [first, ...rest] = liczby;
        wynik =
          dzialanie === "dodawanie" ? liczby.reduce((a, b) => a + b, 0)
          : dzialanie === "odejmowanie" ? rest.reduce((a, b) => a - b, first)
          : dzialanie === "mnozenie" ? liczby.reduce((a, b) => a * b, 1)
          : dzialanie === "dzielenie" ? rest.reduce((a, b) => a / b, first)
          : liczby.reduce((a, b) => a + b, 0) / liczby.length;
        zapis = dzialanie === "srednia" ? `średnia(${liczby.map(fmt).join(znak)})` : liczby.map(fmt).join(znak);
      }
    }

    if (!Number.isFinite(wynik)) return blad("Wynik jest poza zakresem liczb.");
    wynik = zaokr10(wynik);
    return { dzialanie, zapis: `${zapis} = ${fmt(wynik)}`, wynik, pobrano };
  },
});

// ---------- Notatki (pamięć serwera) ----------
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

// ---------- Diagnostyka ----------
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

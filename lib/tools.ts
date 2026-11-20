import { tool } from "ai";
import { z } from "zod";

// ---------- Wspólne pomocnicze ----------

const TIMEZONE = "Europe/Warsaw";
const TIMEOUT_MS = 8000;

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

export const strefaCzasowa = tool({
  description:
    "Ustala strefę czasową (IANA) dla miasta, kraju albo obu (dla precyzji, np. „Paryż” + „USA”) " +
    "na podstawie geokodowania Open-Meteo i podaje aktualną godzinę na miejscu oraz różnicę względem Polski. " +
    "Użyj przy pytaniach „jaka strefa czasowa jest w…”, „która godzina w…”, „ile godzin różnicy z…”.",
  inputSchema: z
    .object({
      miasto: z.string().min(2).max(80).optional().describe("Nazwa miasta, np. „Lizbona”"),
      kraj: z
        .string()
        .min(2)
        .max(80)
        .optional()
        .describe("Nazwa kraju po polsku albo kod ISO, np. „Portugalia” albo „PT”"),
    })
    .refine((v) => v.miasto || v.kraj, { message: "Podaj miasto, kraj albo oba." }),
  execute: async ({ miasto, kraj }) => {
    const pobrano = teraz();
    const zrodlo = "Open-Meteo Geocoding (open-meteo.com)";
    const nazwa = (miasto ?? kraj)!.trim();

    const geo = await getJson(
      `${GEOCODING}?name=${encodeURIComponent(nazwa)}&count=10&language=pl&format=json`,
    );
    if (!geo.ok) return { blad: "Serwis geokodowania (Open-Meteo) nie odpowiada. Spróbuj za chwilę.", pobrano };

    type Miejsce = {
      name: string; latitude: number; longitude: number; feature_code?: string;
      country?: string; country_code?: string; admin1?: string; timezone?: string | null;
    };
    let wyniki: Miejsce[] = geo.data?.results ?? [];

    if (miasto && kraj) {
      const k = kraj.trim().toLowerCase();
      wyniki = wyniki.filter(
        (r) => r.country_code?.toLowerCase() === k || r.country?.toLowerCase().includes(k),
      );
    } else if (!miasto) {
      // Sam kraj: wybieramy obiekt typu „państwo” (feature_code PCL…), jeśli jest.
      wyniki = [...wyniki.filter((r) => r.feature_code?.startsWith("PCL")), ...wyniki];
    }

    const miejsce = wyniki[0];
    if (!miejsce) {
      return {
        blad: miasto && kraj
          ? `Nie znalazłem miejscowości „${miasto}” w kraju „${kraj}”.`
          : `Nie znalazłem miejsca „${nazwa}”.`,
        pobrano,
      };
    }

    // Kraj (np. „Portugalia”) nie ma strefy w geokodowaniu – bierzemy ją z prognozy dla jego środka.
    let timeZone = miejsce.timezone ?? null;
    if (!timeZone) {
      const f = await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${miejsce.latitude}&longitude=${miejsce.longitude}&timezone=auto&current=temperature_2m`,
      );
      timeZone = f.ok ? (f.data?.timezone ?? null) : null;
    }
    if (!timeZone || !poprawnaStrefa(timeZone)) {
      return { blad: `Nie udało się ustalić strefy czasowej dla „${nazwa}”.`, pobrano };
    }

    const lokalizacja = [miejsce.name, miejsce.admin1, miejsce.feature_code?.startsWith("PCL") ? null : miejsce.country]
      .filter(Boolean)
      .join(", ");
    return {
      lokalizacja,
      ...czasWStrefie(timeZone),
      ...(!miasto
        ? { uwaga: "Strefa dla środka kraju. Duże kraje (np. USA, Rosja, Brazylia, Australia) mają kilka stref – podaj miasto." }
        : {}),
      zrodlo,
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
const ZMIENNE_OPCJONALNE = ["OPENROUTER_IMAGE_MODEL", "COINGECKO_DEMO_API_KEY"] as const;
const ustawiona = (name: string) => ((process.env[name] ?? "").trim() !== "" ? "tak" : "nie");

export function createDiagnostyka(info: () => { model: string; narzedzia: string[]; limitKrokow: number }) {
  return tool({
    description:
      "Diagnostyka agenta: nazwa modelu, lista dostępnych narzędzi, limit kroków i informacja, " +
      "czy wymagane zmienne środowiskowe są ustawione (tylko tak/nie). " +
      "Użyj, gdy użytkownik pyta o stan, konfigurację lub gotowość agenta.",
    inputSchema: z.object({}),
    execute: async () => {
      const { model, narzedzia, limitKrokow } = info();
      const wymagane = Object.fromEntries(ZMIENNE_WYMAGANE.map((n) => [n, ustawiona(n)]));
      const opcjonalne = Object.fromEntries(ZMIENNE_OPCJONALNE.map((n) => [n, ustawiona(n)]));
      const brakuje = ZMIENNE_WYMAGANE.filter((n) => wymagane[n] === "nie");
      return {
        model,
        narzedzia,
        liczbaNarzedzi: narzedzia.length,
        limitKrokow,
        zmienneWymagane: wymagane,
        zmienneOpcjonalne: opcjonalne,
        gotowy: brakuje.length === 0 ? "tak" : `nie – brakuje: ${brakuje.join(", ")}`,
        pobrano: teraz(),
      };
    },
  });
}

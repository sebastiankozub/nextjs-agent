import { tool } from "ai";
import { z } from "zod";

// Własne narzędzie (function calling): wykonuje się na naszym serwerze.
export const aktualnyCzas = tool({
  description:
    "Zwraca dzisiejszą datę, dzień tygodnia i aktualną godzinę w Polsce (strefa Europe/Warsaw). " +
    "Użyj, gdy pytanie dotyczy „dziś”, „jutro”, „wczoraj”, dnia tygodnia, godziny " +
    "albo liczenia dni (np. „za ile dni”, „ile zostało do…”). Nie zgaduj daty z pamięci.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    const timeZone = "Europe/Warsaw";
    const part = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("pl-PL", { timeZone, ...options }).format(now);

    return {
      data: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(now), // RRRR-MM-DD
      dzienTygodnia: part({ weekday: "long" }),
      godzina: part({ hour: "2-digit", minute: "2-digit" }),
      strefa: timeZone,
    };
  },
});

// ---------- Wspólne pomocnicze ----------

const TIMEZONE = "Europe/Warsaw";
const TIMEOUT_MS = 8000;

function teraz() {
  return new Date().toLocaleString("pl-PL", { timeZone: TIMEZONE });
}

// Pobiera JSON z publicznego API. Nie rzuca wyjątków – zwraca { ok, ... }.
async function getJson(
  url: string,
): Promise<{ ok: true; data: any } | { ok: false; status?: number; reason?: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
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
    "najpierw ustal datę narzędziem aktualnyCzas.",
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

// ---------- Kursy walut (NBP) ----------

const NBP = "https://api.nbp.pl/api/exchangerates";

type NbpRate = { currency: string; code: string; mid: number };

export const kursWaluty = tool({
  description:
    "Pobiera aktualny średni kurs waluty względem złotego (PLN) z publicznego API NBP (tabele A i B). " +
    "Użyj przy pytaniach o kurs walut lub przeliczanie na złotówki. " +
    "Przyjmuje kod waluty (np. EUR, USD, CHF) albo jej polską nazwę (np. „euro”, „frank szwajcarski”).",
  inputSchema: z.object({
    waluta: z.string().min(2).describe("Kod ISO (EUR, USD, GBP…) albo polska nazwa waluty"),
  }),
  execute: async ({ waluta }) => {
    const pobrano = teraz();
    const zrodlo = "Narodowy Bank Polski (api.nbp.pl)";
    const input = waluta.trim();

    // 1. Wygląda na kod ISO -> zapytanie o jedną walutę (najpierw tabela A, potem B).
    if (/^[a-zA-Z]{3}$/.test(input)) {
      let serwisNieOdpowiada = false;
      for (const table of ["a", "b"]) {
        const res = await getJson(`${NBP}/rates/${table}/${input.toLowerCase()}/?format=json`);
        if (res.ok) {
          const rate = res.data.rates?.[0];
          return {
            waluta: res.data.currency,
            kod: res.data.code,
            kursSredniPLN: rate?.mid,
            opis: `1 ${res.data.code} = ${rate?.mid} PLN (kurs średni NBP)`,
            tabela: `${table.toUpperCase()} ${rate?.no ?? ""}`.trim(),
            dataPublikacji: rate?.effectiveDate,
            zrodlo,
            pobrano,
          };
        }
        if (res.status !== 404) serwisNieOdpowiada = true;
      }
      if (serwisNieOdpowiada) {
        return { blad: "Serwis NBP nie odpowiada. Spróbuj za chwilę.", pobrano };
      }
      // 404 – może to nazwa (np. „jen”), szukamy dalej po nazwie.
    }

    // 2. Szukanie po nazwie w aktualnych tabelach A i B.
    const szukane = input.toLowerCase();
    for (const table of ["a", "b"]) {
      const res = await getJson(`${NBP}/tables/${table}/?format=json`);
      if (!res.ok) {
        return { blad: "Serwis NBP nie odpowiada. Spróbuj za chwilę.", pobrano };
      }
      const t = res.data?.[0];
      const rates: NbpRate[] = t?.rates ?? [];
      const hit =
        rates.find((r) => r.code.toLowerCase() === szukane) ??
        rates.find((r) => r.currency.toLowerCase() === szukane) ??
        rates.find((r) => r.currency.toLowerCase().includes(szukane));
      if (hit) {
        return {
          waluta: hit.currency,
          kod: hit.code,
          kursSredniPLN: hit.mid,
          opis: `1 ${hit.code} = ${hit.mid} PLN (kurs średni NBP)`,
          tabela: `${table.toUpperCase()} ${t.no}`,
          dataPublikacji: t.effectiveDate,
          zrodlo,
          pobrano,
        };
      }
    }

    return { blad: `NBP nie publikuje kursu dla „${waluta}”. Podaj kod waluty, np. EUR.`, pobrano };
  },
});

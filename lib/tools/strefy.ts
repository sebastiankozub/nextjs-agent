import { TIMEZONE, getJson } from "./http";
import { nazwyKrajow } from "./kraje";

// Strefy czasowe: przesunięcia, geokodowanie miejsca → strefa IANA, przeliczanie chwil między strefami.

// Przesunięcie strefy względem UTC w minutach (z formatu „GMT+01:00”).
export function offsetMinut(timeZone: string, date: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const minuty = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minuty : minuty;
}

export function poprawnaStrefa(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function opisRoznicy(minuty: number): string {
  if (minuty === 0) return "ta sama godzina co w Polsce";
  const h = Math.abs(minuty) / 60;
  const ile = Number.isInteger(h) ? `${h} h` : `${h.toFixed(1).replace(".", ",")} h`;
  return minuty > 0 ? `${ile} później niż w Polsce` : `${ile} wcześniej niż w Polsce`;
}

// Data, godzina i różnica względem Polski w podanej strefie.
export function czasWStrefie(timeZone: string, now = new Date()) {
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

export const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

export type Strefa =
  | { ok: true; lokalizacja: string; timeZone: string; tylkoKraj: boolean }
  | { ok: false; blad: string };

// Miasto i/lub kraj -> strefa IANA (geokodowanie Open-Meteo). Wspólne dla strefaCzasowa i przeliczCzas.
export async function ustalStrefe(miasto?: string, kraj?: string): Promise<Strefa> {
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

/** Miasto -> kraj (kod ISO) i strefa – dla asystenta podróży (/dashboard). Geokodowanie Open-Meteo. */
export async function znajdzMiejsce(
  miasto: string,
): Promise<{ ok: true; nazwa: string; kraj: string; kodKraju: string; timeZone: string | null } | { ok: false; blad: string }> {
  const geo = await getJson(`${GEOCODING}?name=${encodeURIComponent(miasto.trim())}&count=1&language=pl&format=json`);
  if (!geo.ok) return { ok: false, blad: "Serwis geokodowania (Open-Meteo) nie odpowiada. Spróbuj za chwilę." };
  const m = geo.data?.results?.[0];
  if (!m?.country_code) return { ok: false, blad: `Nie znalazłem miejscowości „${miasto}”.` };
  const kod = String(m.country_code).toUpperCase();
  return { ok: true, nazwa: m.name, kraj: m.country ?? nazwyKrajow.of(kod) ?? kod, kodKraju: kod, timeZone: m.timezone ?? null };
}

export const UWAGA_KRAJ = "Strefa dla środka kraju. Duże kraje (np. USA, Rosja, Brazylia, Australia) mają kilka stref – podaj miasto.";

// Lokalny czas „ścienny” w strefie -> chwila w UTC (dwie iteracje wystarczą także przy zmianie czasu).
export function lokalnyNaUTC(data: string, godzina: string, timeZone: string): Date {
  const [y, mo, d] = data.split("-").map(Number);
  const [h, mi] = godzina.split(":").map(Number);
  const naiwny = Date.UTC(y, mo - 1, d, h, mi);
  let t = naiwny - offsetMinut(timeZone, new Date(naiwny)) * 60000;
  t = naiwny - offsetMinut(timeZone, new Date(t)) * 60000;
  return new Date(t);
}

export function wStrefie(chwila: Date, timeZone: string) {
  return {
    data: new Intl.DateTimeFormat("sv-SE", { timeZone }).format(chwila),
    dzienTygodnia: new Intl.DateTimeFormat("pl-PL", { timeZone, weekday: "long" }).format(chwila),
    godzina: new Intl.DateTimeFormat("pl-PL", { timeZone, hour: "2-digit", minute: "2-digit" }).format(chwila),
  };
}

// Miejsce: strefa IANA („Europe/Lisbon”), „miasto, kraj” albo sama nazwa miasta/kraju.
export async function ustalMiejsce(miejsce: string): Promise<Strefa> {
  const m = miejsce.trim();
  if (m.includes("/") && poprawnaStrefa(m)) return { ok: true, lokalizacja: m, timeZone: m, tylkoKraj: false };
  if (/^polska$|^pl$/i.test(m)) return { ok: true, lokalizacja: "Polska", timeZone: TIMEZONE, tylkoKraj: false };
  const [miasto, kraj] = m.split(",").map((x) => x.trim());
  return ustalStrefe(miasto, kraj || undefined);
}

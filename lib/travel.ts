// Asystent podróży (/dashboard) – logika bez zależności (testowana w tests/analysis.test.mjs).
// Dane pobiera lib/travel-sources.ts tymi samymi funkcjami, z których korzystają narzędzia agenta.

export const TRAVEL_SOURCES = ["pogoda", "waluty", "swieta", "wikipedia", "czas"] as const;
export type TravelSource = (typeof TRAVEL_SOURCES)[number];

export const SOURCE_LABELS: Record<TravelSource, string> = {
  pogoda: "Pogoda",
  waluty: "Waluty",
  swieta: "Święta",
  wikipedia: "Wikipedia",
  czas: "Czas",
};

/** Wynik jednej karty. Przy błędzie – tylko powód; NIGDY danych zastępczych. */
export type TravelCard =
  | { ok: true; value: string; details: string[]; link?: string; source: string; fetchedAt: string }
  | { ok: false; reason: string; source: string; fetchedAt: string };

/**
 * Waluta kraju (kod ISO 3166-1 → kod ISO 4217). Dane referencyjne, nie prognoza – gdy kraju
 * nie ma na liście, karta Waluty pokazuje „Brak danych” zamiast zgadywać.
 */
export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  // Strefa euro
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR", DE: "EUR", GR: "EUR",
  IE: "EUR", IT: "EUR", LV: "EUR", LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR",
  SI: "EUR", ES: "EUR", BG: "EUR", AD: "EUR", MC: "EUR", SM: "EUR", VA: "EUR", ME: "EUR", XK: "EUR",
  // Europa poza strefą euro
  PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", SE: "SEK", DK: "DKK", NO: "NOK", IS: "ISK", CH: "CHF",
  LI: "CHF", GB: "GBP", UA: "UAH", RS: "RSD", BA: "BAM", MK: "MKD", AL: "ALL", MD: "MDL", GE: "GEL",
  AM: "AMD", TR: "TRY",
  // Świat
  US: "USD", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  JP: "JPY", CN: "CNY", KR: "KRW", IN: "INR", TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", SG: "SGD",
  PH: "PHP", HK: "HKD", TW: "TWD", AE: "AED", SA: "SAR", IL: "ILS", EG: "EGP", MA: "MAD", TN: "TND",
  ZA: "ZAR", KE: "KES", AU: "AUD", NZ: "NZD", KZ: "KZT",
};

const ABBREVIATION = /(?:^|\s)(?:ok|tys|mln|mld|r|w|ur|zm|m\.in|np|ul|al|pl|św|św|gen|prof|dr|tzw|wg|n\.p\.m|p\.n\.e|n\.e)\.$/iu;

/** Pierwsze n zdań tekstu (dla karty Wikipedia). */
export function firstSentences(text: string, n = 2): string {
  const clean = text.replace(/\s+/g, " ").replace(/\s*…$/, "").trim();
  // Koniec zdania: . ! ? i spacja + wielka litera. Skróty („ok.”, „r.”, „m.in.”, „św.”) nie kończą zdania.
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ„"])/u);
  const sentences: string[] = [];
  for (const part of parts) {
    const prev = sentences[sentences.length - 1];
    if (prev && ABBREVIATION.test(prev)) sentences[sentences.length - 1] = `${prev} ${part}`;
    else sentences.push(part);
  }
  return sentences.slice(0, n).join(" ").trim();
}

/** Najbliższe dni wolne od dnia podróży (włącznie), posortowane, najwyżej `limit`. */
export function upcomingHolidays<T extends { data: string }>(lista: T[], od: string, limit = 3): T[] {
  return lista
    .filter((s) => s.data >= od)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(0, limit);
}

/** Poprawna data RRRR-MM-DD (także kalendarzowo, np. bez 31 lutego). */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Słowa, po których poznajemy, że podsumowanie wspomina brakujące źródło (z odmianą).
const MISSING_HINTS: Record<TravelSource, string[]> = {
  pogoda: ["pogod", "prognoz"],
  waluty: ["walut", "kurs"],
  swieta: ["święt", "swiet", "dni woln", "dniach woln"],
  wikipedia: ["wikipedi", "opisu miasta", "opis miasta"],
  czas: ["godzin", "stref", "czasu lokaln", "różnic"],
};

/**
 * Podsumowanie MUSI mówić wprost, których źródeł zabrakło. Gdy model o którymś nie wspomniał,
 * serwer dopisuje jedno zdanie – nie polegamy tylko na posłuszeństwie modelu.
 */
export function ensureMissingMentioned(summary: string, missing: TravelSource[]): string {
  const text = summary.trim();
  const lower = text.toLowerCase();
  const notMentioned = missing.filter((s) => !MISSING_HINTS[s].some((hint) => lower.includes(hint)));
  if (notMentioned.length === 0) return text;
  const names = notMentioned.map((s) => SOURCE_LABELS[s]).join(", ");
  return `${text}${text ? " " : ""}Zabrakło danych ze źródeł: ${names} – spróbuj odświeżyć.`.trim();
}

/** Podsumowanie, gdy nie ma ŻADNYCH danych – bez wywoływania modelu (nie ma na czym się oprzeć). */
export function noDataSummary(): string {
  return `Nie mam żadnych danych o tym wyjeździe – nie odpowiedziało żadne źródło (${TRAVEL_SOURCES.map((s) => SOURCE_LABELS[s]).join(", ")}). Spróbuj odświeżyć.`;
}

// --- Tryb „Porównaj”: dwa miasta, ten sam termin ---

export type CityMissing = { miasto: string; missing: TravelSource[] };

/**
 * Rekomendacja MUSI mówić wprost, których źródeł zabrakło (dla którego miasta).
 * Gdy model pominął brak, serwer dopisuje jedno zdanie z listą „miasto – źródła”.
 */
export function ensureCompareMissingMentioned(text: string, cities: CityMissing[]): string {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const notMentioned = cities
    .map(({ miasto, missing }) => ({
      miasto,
      missing: missing.filter((s) => !MISSING_HINTS[s].some((hint) => lower.includes(hint))),
    }))
    .filter((c) => c.missing.length > 0);
  if (notMentioned.length === 0) return clean;
  const list = notMentioned.map((c) => `${c.miasto} – ${c.missing.map((s) => SOURCE_LABELS[s]).join(", ")}`).join("; ");
  return `${clean}${clean ? " " : ""}Zabrakło danych: ${list} – spróbuj odświeżyć.`.trim();
}

/** Rekomendacja bez modelu, gdy dla OBU miast nie ma żadnych danych. */
export function noDataCompareSummary(a: string, b: string): string {
  return `Nie mogę polecić ani ${a}, ani ${b} – nie odpowiedziało żadne źródło dla obu miast. Spróbuj odświeżyć.`;
}

/** Tekst rekomendacji ze struktury modelu: zawsze zaczyna się od „Polecam: <miasto>.” */
export function formatRecommendation(polecam: string, uzasadnienie: string): string {
  return `Polecam: ${polecam}. ${uzasadnienie.trim()}`;
}

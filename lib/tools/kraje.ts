import { getJson } from "./http";

// Kraje i święta z Nager.Date: nazwa → kod ISO, dni wolne w roku.
// Dokumentacja: https://date.nager.at/Api – /api/v3/AvailableCountries → [{ countryCode, name }],
// /api/v3/PublicHolidays/{rok}/{kod} → [{ date, localName, name, countryCode, global, counties, types }].
// 404 = nieznany kraj, 204 = brak danych.

export const NAGER = "https://date.nager.at/api/v3";
export const nazwyKrajow = new Intl.DisplayNames(["pl"], { type: "region" });

export async function kodKraju(kraj: string): Promise<{ ok: true; kod: string } | { ok: false; blad: string }> {
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

// Ogólnokrajowe dni wolne od pracy w danym roku: mapa „RRRR-MM-DD” -> nazwa.
export async function swietaWRoku(kod: string, rok: number): Promise<{ ok: true; mapa: Map<string, string> } | { ok: false; blad: string }> {
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

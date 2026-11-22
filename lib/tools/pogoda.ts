import { tool } from "ai";
import { z } from "zod";
import { getJson, teraz, TIMEZONE } from "./http";
import { pogodaNaDzien, pogodaTeraz } from "./pogoda-wynik";

// Pogoda z Open-Meteo: miasto → współrzędne (geokodowanie) → prognoza → wynik po polsku.
// Dokumentacja: https://open-meteo.com/en/docs

const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ZRODLO = "Open-Meteo (open-meteo.com)";
const NIE_ODPOWIADA = "Serwis pogody (Open-Meteo) nie odpowiada. Spróbuj za chwilę.";

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
    const miejsce = await geokoduj(miasto);
    if (!miejsce.ok) return { blad: miejsce.blad, pobrano };

    const res = await getJson(`${FORECAST}?${parametryPrognozy(miejsce, data, godzina)}`);
    if (!res.ok) {
      const blad = res.status === 400 ? "Open-Meteo nie ma prognozy dla tej daty (prognoza sięga maks. 15 dni naprzód)." : NIE_ODPOWIADA;
      return { blad, pobrano };
    }

    const wynik = data ? pogodaNaDzien(res.data, data, godzina) : pogodaTeraz(res.data);
    return { lokalizacja: miejsce.lokalizacja, ...wynik, zrodlo: ZRODLO, pobrano };
  },
});

type Miejsce = { ok: true; lokalizacja: string; latitude: number; longitude: number } | { ok: false; blad: string };

/** Miasto → współrzędne i czytelna nazwa („Gdańsk, Pomorskie, Polska”). */
async function geokoduj(miasto: string): Promise<Miejsce> {
  const geo = await getJson(`${GEOCODING}?name=${encodeURIComponent(miasto)}&count=1&language=pl&format=json`);
  if (!geo.ok) return { ok: false, blad: NIE_ODPOWIADA };
  const m = geo.data?.results?.[0];
  if (!m) return { ok: false, blad: `Nie znalazłem miejscowości „${miasto}”.` };
  const lokalizacja = [m.name, m.admin1, m.country].filter(Boolean).join(", ");
  return { ok: true, lokalizacja, latitude: m.latitude, longitude: m.longitude };
}

/** Parametry zapytania: pogoda teraz albo prognoza dzienna (+ godzinowa, gdy podano godzinę). */
function parametryPrognozy(miejsce: { latitude: number; longitude: number }, data?: string, godzina?: string) {
  const params = new URLSearchParams({
    latitude: String(miejsce.latitude),
    longitude: String(miejsce.longitude),
    timezone: TIMEZONE,
  });
  if (!data) {
    params.set("current", "temperature_2m,weather_code,precipitation,wind_speed_10m");
    return params;
  }
  params.set("start_date", data);
  params.set("end_date", data);
  params.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max");
  if (godzina) params.set("hourly", "temperature_2m,weather_code,precipitation_probability,wind_speed_10m");
  return params;
}

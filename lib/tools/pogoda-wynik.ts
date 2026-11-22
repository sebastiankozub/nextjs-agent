// Pogoda – przekład odpowiedzi Open-Meteo na wynik po polsku. Bez zależności (testowane w tests/analysis.test.mjs).

// Kody pogody WMO -> opis po polsku.
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
export const opis = (code: unknown) => (typeof code === "number" ? (WMO[code] ?? `kod pogody ${code}`) : "brak danych");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Prognoza = any; // odpowiedź Open-Meteo (pola zależne od parametrów zapytania)

/** Wynik „teraz” z pola current. */
export function pogodaTeraz(d: Prognoza) {
  const c = d?.current ?? {};
  return {
    czas: c.time,
    opis: opis(c.weather_code),
    temperaturaC: c.temperature_2m,
    opadMm: c.precipitation,
    wiatrKmH: c.wind_speed_10m,
  };
}

/** Wynik na dzień z pola daily, a przy podanej godzinie – także oGodzinie z pola hourly. */
export function pogodaNaDzien(d: Prognoza, data: string, godzina?: string) {
  const day = d?.daily ?? {};
  const wynik: Record<string, unknown> = {
    data,
    opis: opis(day.weather_code?.[0]),
    temperaturaMinC: day.temperature_2m_min?.[0],
    temperaturaMaxC: day.temperature_2m_max?.[0],
    szansaOpadowProc: day.precipitation_probability_max?.[0],
    wiatrMaxKmH: day.wind_speed_10m_max?.[0],
  };
  const h = d?.hourly;
  if (!godzina || !h?.time) return wynik;
  const pelnaGodzina = `${godzina.slice(0, 2)}:00`;
  const i = h.time.indexOf(`${data}T${pelnaGodzina}`);
  if (i >= 0) {
    wynik.oGodzinie = {
      godzina: pelnaGodzina,
      opis: opis(h.weather_code?.[i]),
      temperaturaC: h.temperature_2m?.[i],
      szansaOpadowProc: h.precipitation_probability?.[i],
      wiatrKmH: h.wind_speed_10m?.[i],
    };
  }
  return wynik;
}

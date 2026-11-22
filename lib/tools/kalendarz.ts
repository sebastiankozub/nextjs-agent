// Dni robocze – czyste funkcje bez zależności (testowane w tests/analysis.test.mjs).
// Święta pobiera narzędzie dniRobocze (lib/tools/dni-robocze.ts) i przekazuje tu jako mapę.

/** Święta: „RRRR-MM-DD” → nazwa. */
export type Swieta = Map<string, string>;
type Pominiete = { weekendy: number; swieta: Array<{ data: string; nazwa: string }> };

/** Tryb 1: data ± N dni roboczych. Liczymy od dnia następnego (poprzedniego) po dacie „od”. */
export function dodajDniRobocze(od: string, dni: number, swieta: Swieta): { data: string } & Pominiete {
  const krok = dni >= 0 ? 1 : -1;
  const pominiete: Pominiete = { weekendy: 0, swieta: [] };
  let data = od;
  let zostalo = Math.abs(dni);
  while (zostalo > 0) {
    data = dodajDni(data, krok);
    if (czyRoboczy(data, swieta, pominiete)) zostalo--;
  }
  return { data, ...pominiete };
}

/** Tryb 2: liczba dni roboczych w przedziale [a, b] włącznie (a ≤ b). */
export function policzDniRobocze(a: string, b: string, swieta: Swieta): { dniRobocze: number } & Pominiete {
  const pominiete: Pominiete = { weekendy: 0, swieta: [] };
  let dniRobocze = 0;
  for (let d = a; d <= b; d = dodajDni(d, 1)) {
    if (czyRoboczy(d, swieta, pominiete)) dniRobocze++;
  }
  return { dniRobocze, ...pominiete };
}

/** Czy dzień jest roboczy; dzień wolny dopisuje do `pominiete`. */
function czyRoboczy(iso: string, swieta: Swieta, pominiete: Pominiete): boolean {
  if (weekend(iso)) {
    pominiete.weekendy++;
    return false;
  }
  const nazwa = swieta.get(iso);
  if (nazwa) {
    pominiete.swieta.push({ data: iso, nazwa });
    return false;
  }
  return true;
}

export const dodajDni = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dniMiedzy = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
export const poprawnaData = (iso: string) => !Number.isNaN(Date.parse(`${iso}T12:00:00Z`));
export const dzienTyg = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pl-PL", { weekday: "long", timeZone: "UTC" });
const weekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());

/** Górna granica zakresu dla trybu 1: N dni roboczych to najwyżej ~1,6 N dni kalendarzowych (+ zapas na święta). */
export function szacowanyKoniec(od: string, dni: number): string {
  return dodajDni(od, Math.sign(dni) * Math.ceil(Math.abs(dni) * 1.6 + 20));
}

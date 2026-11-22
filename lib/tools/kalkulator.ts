import { tool } from "ai";
import { z } from "zod";
import { teraz } from "./http";

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

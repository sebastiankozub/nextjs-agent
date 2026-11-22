import { tool } from "ai";
import { z } from "zod";
import { TIMEZONE, getJson, teraz } from "./http";

// Firma – Biała lista podatników VAT (Ministerstwo Finansów).
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

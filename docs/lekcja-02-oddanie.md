# Lekcja 2 – do oddania (Zadanie 2)

**Termin: 12 listopada 2026, do godz. 23:59. Punkty: 10.**

## Treść zadania

**Zadanie 2 – Instrukcje i format odpowiedzi.**
Dodaj personę, zasady, przykłady few-shot i odpowiedź JSON sprawdzaną względem schematu.
Przeprowadź próbę prompt injection i popraw instrukcje.

**Do oddania:** link do kodu lub commita, wynik testu (opis, zrzut lub nagranie) i krótki opis zmian.

## Kryteria oceny (10 pkt)

| Kryterium | Pkt | Gdzie jest dowód |
|---|---|---|
| Persona, zasady i przykłady | 3 | `lib/instructions.ts` (W1), log W1 w `logs/` |
| JSON z walidacją i obsługą błędu | 3 | `lib/analysis.ts`, `app/api/analyze/route.ts`, `tests/analysis.test.mjs` (`npm run test:analysis`) |
| Udokumentowany test ataku i poprawka | 3 | `logs/2026-11-10_1440_log-lekcja-02.md` (W3: przed / poprawki / po, R1–R10), zrzuty w `docs/lekcja-02-screens/` |
| Opis zmian | 1 | sekcja „Opis zmian” niżej |

## Checklista oddania

- [ ] Link do kodu: https://github.com/sebastiankozub/nextjs-agent
- [ ] Link do commita (W1+W2): `91485db`
- [ ] Link do commita (W3): `668e8a8`
- [ ] Link do commita z ulepszeniami czatu (po przeniesieniu z gałęzi `chat-w3-custom-1.0`): _(do uzupełnienia)_
- [ ] Wynik testu: log + zrzuty „przed / po” w `docs/lekcja-02-screens/`
- [ ] Opis zmian (niżej)
- [ ] `git push` przed oddaniem

## Opis zmian

_(do uzupełnienia – wersja „ludzkim językiem” przygotowana w rozmowie z 2026-11-10; dopisać ulepszenia czatu po przeniesieniu z gałęzi)_

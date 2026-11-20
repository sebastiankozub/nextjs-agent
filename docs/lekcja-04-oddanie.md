# Lekcja 4 – do oddania (Zadanie 4: własny scenariusz wielokrokowy)

**Termin: ____ . Punkty: 16.**

## Treść zadania

Dodaj własny scenariusz wielokrokowy: jedno polecenie, po którym agent sam wykonuje co najmniej 3 kroki,
a każdy kolejny korzysta z wyniku poprzedniego. Scenariusz pasuje do tematu chatbota.
Zrzut ekranu z widocznymi krokami + dwa zdania opisu na czacie kursu.

## 1. Link do kodu / commitów

- Repozytorium: https://github.com/sebastiankozub/nextjs-agent
- Stan wyjściowy (po lekcji 3): [5df26a5](https://github.com/sebastiankozub/nextjs-agent/commit/5df26a5)
- W0 – wygląd: ____
- W1 – osiem narzędzi: ____
- W2 – pętla ReAct, limity: ____
- W3 – `/dashboard`: ____
- Scenariusz z pracy domowej: ____
- **Aplikacja online:** https://nextjs-agent-five.vercel.app/

## 2. Kryteria oceny → dowody

| Kryterium | Pkt | Test | Dowód |
|---|---|---|---|
| Scenariusz działa od polecenia do odpowiedzi | 4 | S1 | `lekcja-04-screens/____` |
| ≥3 kroki, kolejny korzysta z wyniku poprzedniego | 4 | S1 | `lekcja-04-screens/____` |
| Zatrzymanie na limicie + zrozumiały komunikat przy błędzie narzędzia | 4 | S2, S3 | `lekcja-04-screens/____` |
| Zrzut z krokami + dwa zdania na czacie kursu | 4 | – | link do wpisu: ____ |

## 3. Scenariusz

- Polecenie: ____
- Kroki: 1. ____ → 2. ____ → 3. ____
- Dlaczego pasuje do tematu chatbota: ____

## 4. Wyniki testów z zajęć

| # | Wiadomość | Oczekiwane | Wynik |
|---|---|---|---|
| W1-1 | `Jaka będzie jutro pogoda w Lizbonie?` | etykieta pogoda | ⬜ |
| W1-2 | `Ile złotych to 250 euro po dzisiejszym kursie NBP?` | etykieta waluty | ⬜ |
| W1-3 | `Jakie dni wolne od pracy są w Portugalii w grudniu?` | swieta | ⬜ |
| W1-4 | `Opowiedz w trzech zdaniach o Lizbonie — na podstawie Wikipedii, z linkiem.` | wikipedia + link | ⬜ |
| W1-5 | `Policz: 3 noclegi po 420 zł plus 2 bilety po 389 zł.` | kalkulator, 2038 zł | ⬜ |
| W1-6 | `Która jest teraz godzina w Lizbonie?` | czas | ⬜ |
| W1-7 | `Zapisz notatkę: sprawdzić ceny lotów do Lizbony. Potem pokaż wszystkie moje notatki.` | notatki ×2 | ⬜ |
| W1-8 | `Uruchom diagnostykę i powiedz, czy wszystko jest gotowe do pracy.` | diagnostyka, env tylko tak/nie | ⬜ |
| W1-9 | `Jaka będzie jutro pogoda w mieście Xyzabcowo?` | brak miasta, bez zmyślania | ⬜ |
| W2-1 | `Sprawdź kurs euro, a potem policz, ile euro dostanę za 1500 zł.` | 1. waluty → 2. kalkulator, wynik z kursu | ⬜ |
| W2-2 | (limit 2) `Porównaj pogodę jutro w Lizbonie, Rzymie, Atenach i Oslo.` | „Zatrzymałem się po … krokach” + wynik częściowy | ⬜ |
| W3-1 | `/dashboard`: Lizbona, data za tydzień | 5 kart z godziną pobrania, Odśwież zmienia godziny | ⬜ |
| S1 | scenariusz z pracy domowej | ≥3 kroki | ⬜ |
| S2 | scenariusz przy niskim limicie | komunikat o zatrzymaniu | ⬜ |
| S3 | scenariusz z błędem narzędzia | czytelny komunikat, wynik częściowy | ⬜ |

## 5. Poziomy

| Warsztat | Poziom |
|---|---|
| W0 – wygląd | ____ |
| W1 – osiem narzędzi | ____ |
| W2 – ReAct, limity | ____ |
| W3 – dashboard | ____ |

## 6. Krótki opis zmian

- ____

## 7. Tekst na czat kursu

> ____

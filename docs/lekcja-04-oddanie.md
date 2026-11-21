# Lekcja 4 – do oddania (Zadanie 4: własny scenariusz wielokrokowy)

**Termin: ____ . Punkty: 16.**

## Treść zadania

Dodaj własny scenariusz wielokrokowy: jedno polecenie, po którym agent sam wykonuje co najmniej 3 kroki,
a każdy kolejny korzysta z wyniku poprzedniego. Scenariusz pasuje do tematu chatbota.
Zrzut ekranu z widocznymi krokami + dwa zdania opisu na czacie kursu.

## 1. Link do kodu / commitów

- Repozytorium: https://github.com/sebastiankozub/nextjs-agent
- Stan wyjściowy (po lekcji 3): [5df26a5](https://github.com/sebastiankozub/nextjs-agent/commit/5df26a5)
- W0 – wygląd, 7 motywów: [306e97c](https://github.com/sebastiankozub/nextjs-agent/commit/306e97c)
- W1 – osiem narzędzi + strefa czasowa: [da220ff](https://github.com/sebastiankozub/nextjs-agent/commit/da220ff); dla szybkich – firma, dniRobocze, przeliczCzas: [11c5404](https://github.com/sebastiankozub/nextjs-agent/commit/11c5404)
- W2 – pętla ReAct, limity, lista kroków, statystyki: [11d8211](https://github.com/sebastiankozub/nextjs-agent/commit/11d8211); poprawki, przycisk Stop, ponowienia API: [c7dff1b](https://github.com/sebastiankozub/nextjs-agent/commit/c7dff1b)
- W3 – `/dashboard` (5 kart, podsumowanie, tryb Porównaj): [16a88c2](https://github.com/sebastiankozub/nextjs-agent/commit/16a88c2)
- Scenariusz z pracy domowej: ____
- Wersja do oceny: gałąź `main` (najnowszy commit)
- **Aplikacja online:** https://nextjs-agent-five.vercel.app/ (logowanie hasłem warsztatowym – podam na czacie kursu)

## 2. Kryteria oceny → dowody

| Kryterium | Pkt | Test | Dowód |
|---|---|---|---|
| Scenariusz działa od polecenia do odpowiedzi | 4 | S1 | `lekcja-04-screens/01-scenariusz-kroki.png` |
| ≥3 kroki, kolejny korzysta z wyniku poprzedniego | 4 | S1 | `lekcja-04-screens/01-scenariusz-kroki.png` (lista kroków + statystyki pod odpowiedzią) |
| Zatrzymanie na limicie + zrozumiały komunikat przy błędzie narzędzia | 4 | S2, S3 | `lekcja-04-screens/02-scenariusz-limit.png`, `03-scenariusz-blad-narzedzia.png` |
| Zrzut z krokami + dwa zdania na czacie kursu | 4 | – | link do wpisu: ____ |

## 3. Scenariusz

Temat chatbota: asystent obsługi klientów Studio Nova (konsultacja online 45 min, 150 zł brutto).

**Propozycja (do wyboru przed testem – skreśl pozostałe):**

| | Polecenie | Kroki (każdy korzysta z poprzedniego) |
|---|---|---|
| **A (polecam)** | `Klient z firmy o NIP ____ chce konsultację za 5 dni roboczych. Sprawdź firmę i jej status VAT, ustal datę konsultacji, potem termin płatności faktury 7 dni roboczych po konsultacji i zapisz notatkę ze wszystkimi danymi.` | 1. 🏢 firma (nazwa, status VAT, adres) → 2. 📅 dni robocze (data konsultacji) → 3. 📅 dni robocze (termin płatności liczony od daty z kroku 2) → 4. 📝 notatki (dane z kroków 1–3) |
| B | `Klient z Lizbony płaci w euro. Sprawdź kurs NBP, policz cenę 3 konsultacji w euro i zapisz wycenę w notatce.` | 1. 💱 waluty → 2. 🧮 kalkulator (450 zł / kurs) → 3. 📝 notatki |
| C | `Zaproponuj termin konsultacji dla klienta z Portugalii: pierwszy dzień roboczy po 15 grudnia, który nie jest świętem ani u nas, ani u niego, o 10:00 jego czasu.` | 1. 🎉 święta PL i PT → 2. 📅 dni robocze → 3. 🌐 przeliczanie czasu |

- Wybrany scenariusz: ____
- Polecenie: ____
- Kroki: 1. ____ → 2. ____ → 3. ____
- Dlaczego pasuje do tematu chatbota: ____

## 4. Wyniki testów z zajęć

Model czatu: ____ · data testów: ____ · lokalnie (`npm run dev`) / produkcja: ____.
Limity z `.env.local` (domyślne): 6 kroków, 16 wywołań narzędzi, 60 s na zadanie, 6 s na próbę API + 1 ponowienie.

| # | Wiadomość | Oczekiwane | Wynik |
|---|---|---|---|
| W1-1 | `Jaka będzie jutro pogoda w Lizbonie?` | 1. czas → 2. pogoda | ⬜ |
| W1-2 | `Ile złotych to 250 euro po dzisiejszym kursie NBP?` | etykieta waluty | ⬜ |
| W1-3 | `Jakie dni wolne od pracy są w Portugalii w grudniu?` | swieta | ⬜ |
| W1-4 | `Opowiedz w trzech zdaniach o Lizbonie — na podstawie Wikipedii, z linkiem.` | wikipedia + link | ⬜ |
| W1-5 | `Policz: 3 noclegi po 420 zł plus 2 bilety po 389 zł.` | kalkulator, 2038 zł | ⬜ |
| W1-6 | `Która jest teraz godzina w Lizbonie?` | czas / strefa czasowa | ⬜ |
| W1-7 | `Zapisz notatkę: sprawdzić ceny lotów do Lizbony. Potem pokaż wszystkie moje notatki.` | notatki ×2 | ⬜ |
| W1-8 | `Uruchom diagnostykę i powiedz, czy wszystko jest gotowe do pracy.` | diagnostyka, env tylko tak/nie, limity | ⬜ |
| W1-9 | `Jaka będzie jutro pogoda w mieście Xyzabcowo?` | brak miasta, bez zmyślania | ⬜ |
| W2-1 | `Sprawdź kurs euro, a potem policz, ile euro dostanę za 1500 zł.` | „1. 💱 waluty → 2. 🧮 kalkulator”, wynik z kursu z kroku 1 | ⬜ |
| W2-2 | (`AGENT_MAX_STEPS=2`) `Porównaj pogodę jutro w Lizbonie, Rzymie, Atenach i Oslo.` | „Zatrzymałem się po 2 krokach” albo „Nie zdążyłem jeszcze…” + propozycja polecenia w polu wiadomości | ⬜ |
| W2-3 | (`AGENT_MAX_TOOL_CALLS=2`) `Podaj kursy EUR, USD, CHF i GBP.` | „· limit wywołań narzędzi” w statystykach, wynik częściowy | ⬜ |
| W2-4 | (`AGENT_TOOL_TIMEOUT_SECONDS=1`) dowolne pytanie o pogodę | ✗ w statystykach, „Nie udało się sprawdzić: pogoda: Źródło nie odpowiada…” | ⬜ |
| W2-5 | długie zadanie + przycisk **Stop** | zostają kroki + „Przerwane przez użytkownika” | ⬜ |
| W3-1 | `/dashboard`: Lizbona, data za tydzień | 5 kart z godziną pobrania, Odśwież zmienia godziny, podsumowanie | ⬜ |
| W3-2 | `/dashboard` przy niedziałającym źródle (np. bez internetu albo nieznany kraj waluty) | karta „Brak danych — spróbuj odświeżyć”, pozostałe OK, podsumowanie mówi, czego zabrakło | ⬜ |
| W3-3 | `/dashboard` → Porównaj: Lizbona vs Porto | karty obok siebie, „Polecam: …” z wartościami z kart | ⬜ |
| S1 | scenariusz z pracy domowej | ≥3 kroki, każdy z wyniku poprzedniego | ⬜ |
| S2 | scenariusz przy `AGENT_MAX_STEPS=2` | komunikat o zatrzymaniu + propozycja dokończenia | ⬜ |
| S3 | scenariusz z błędem narzędzia (np. zły NIP albo `AGENT_TOOL_TIMEOUT_SECONDS=1`) | czytelny komunikat, wynik częściowy, bez powtarzania wywołania | ⬜ |

Testy automatyczne: `npm run test:analysis` – 61/61 ✅ (logika limitów, komunikatów, Stop, dashboardu, bezpieczeństwa historii R3/R4).

**Po testach z limitami przywróć wartości w `.env.local` i zrestartuj `npm run dev`.**

## 5. Poziomy

| Warsztat | Poziom |
|---|---|
| W0 – wygląd | 🟣 (jasny/ciemny + 7 motywów) |
| W1 – osiem narzędzi | 🟣 (+ strefaCzasowa, firma, dniRobocze, przeliczCzas) |
| W2 – ReAct, limity | 🟣 (limity 🔵 + przycisk Stop) |
| W3 – dashboard | 🟣 (stany kart 🔵 + tryb Porównaj) |

## 6. Krótki opis zmian

Asystent Studio Nova sam rozkłada zadanie na kroki: sięga po narzędzie, czyta wynik i dopiero wtedy decyduje, co dalej.

**Narzędzia (W1).** Osiem narzędzi z lekcji – pogoda, waluty (NBP), święta (Nager.Date), Wikipedia, kalkulator (bez wykonywania wpisanego kodu),
czas, notatki, diagnostyka – oraz strefa czasowa i trzy pod temat obsługi klientów: dane firmy po NIP/REGON/rachunku (biała lista VAT),
dni robocze (bez weekendów i świąt dowolnego kraju) i przeliczanie godziny spotkania na czas w kilku miejscach.

**Pętla ReAct i limity (W2).** Nad odpowiedzią ponumerowana lista kroków („1. 💱 waluty → 2. 🧮 kalkulator”), pod nią liczba kroków,
wywołań narzędzi i czasy. Limity z `.env.local`: 6 kroków, 16 wywołań narzędzi, 60 s na zadanie, czas odpowiedzi API z jednym ponowieniem.
Gdy limit się kończy, agent w ostatnim kroku może już tylko odpowiedzieć: podsumowuje ustalenia, wymienia, czego nie zdążył,
i wpisuje propozycję dokończenia w pole wiadomości – nie udaje, że „nie ma takiej możliwości”. Błąd narzędzia = wprost „Nie udało się sprawdzić: …”
i wynik częściowy; nieudane wywołanie nie jest powtarzane. Przycisk **Stop** przerywa zadanie także na serwerze.

**Asystent podróży (W3).** `/dashboard` (tylko po zalogowaniu): miasto i data → pięć kart z tych samych funkcji co narzędzia agenta,
każda z wartością, źródłem i godziną pobrania, „Odśwież”, podsumowanie agenta. Każda karta ładuje się osobno – awaria jednego źródła
daje „Brak danych — spróbuj odświeżyć” tylko na tej karcie, nigdy danych zastępczych, a podsumowanie mówi, czego zabrakło.
Tryb **Porównaj**: dwa miasta obok siebie i rekomendacja jednego z uzasadnieniem z kart.

**Zastrzeżenie.** Wyniki dotyczą tego modelu i tych testów. Darmowe API (NBP, Open-Meteo, Nager.Date, Wikipedia) bywają chwilowo niedostępne –
wtedy agent i dashboard pokazują brak danych zamiast zgadywać.

## 7. Tekst na czat kursu

> Mój asystent Studio Nova z jednego polecenia sprawdza firmę klienta po NIP (biała lista VAT), wylicza datę konsultacji i od niej termin płatności w dniach roboczych, a na koniec zapisuje notatkę z tymi danymi – każdy krok korzysta z wyniku poprzedniego (lista kroków na zrzucie). Gdy skończy się limit albo źródło nie odpowiada, agent mówi wprost, czego nie sprawdził, i proponuje polecenie do dokończenia zamiast zgadywać.

_(Wersja dla scenariusza A – po wyborze innego scenariusza popraw pierwsze zdanie.)_

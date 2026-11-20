# Lekcja 3 – do oddania (Zadanie 3: Agent korzystający z narzędzi)

**Termin: 24 listopada 2026, do godz. 23:59. Punkty: 16.**

## Treść zadania

Dodaj wyszukiwanie Google Search, generowanie obrazu Nano Banana 2 i analizę obrazu (Vision).
Połącz funkcje w agencie z wieloma narzędziami.

**Do oddania:** link do kodu lub commita, wynik testu (opis, zrzut lub nagranie) i krótki opis zmian.

## 1. Link do kodu / commitów

- Repozytorium: https://github.com/sebastiankozub/nextjs-agent
- W1 – wyszukiwanie ze źródłami, aktualnyCzas, pogoda, kursy walut: [40f61c3](https://github.com/sebastiankozub/nextjs-agent/commit/40f61c3), kryptowaluty: [a3c452c](https://github.com/sebastiankozub/nextjs-agent/commit/a3c452c)
- W2 – Vision i generowanie obrazu (Nano Banana 2): [af65b82](https://github.com/sebastiankozub/nextjs-agent/commit/af65b82), dopracowanie: [ed62ef7](https://github.com/sebastiankozub/nextjs-agent/commit/ed62ef7), analiza zdjęć dokumentów: [624eb3a](https://github.com/sebastiankozub/nextjs-agent/commit/624eb3a)
- W3 – jeden agent z wieloma narzędziami (`/api/agent`, tryby chat / analyze): [cecd98c](https://github.com/sebastiankozub/nextjs-agent/commit/cecd98c), [77f79bd](https://github.com/sebastiankozub/nextjs-agent/commit/77f79bd)
- Poprawki przed oddaniem (źródła wyszukiwania, komunikaty błędów): [6a63762](https://github.com/sebastiankozub/nextjs-agent/commit/6a63762), [77a9a3d](https://github.com/sebastiankozub/nextjs-agent/commit/77a9a3d)
- Wersja do oceny: gałąź `main` (najnowszy commit)
- **Aplikacja online:** https://nextjs-agent-five.vercel.app/ (logowanie hasłem warsztatowym – podam na czacie kursu)

## 2. Kryteria oceny → dowody

| Kryterium | Pkt | Test | Dowód |
|---|---|---|---|
| Wyszukiwanie z linkami do źródeł | 4 | T1 | `lekcja-03-screens/01-wyszukiwanie-zrodla.jpg` |
| Rzeczywiście wygenerowany obraz (Nano Banana 2) | 4 | T2 | `lekcja-03-screens/02-obraz-nano-banana.jpg` |
| Analiza przesłanego obrazu (Vision) | 4 | T3 | `lekcja-03-screens/03-vision.png` |
| Wybór narzędzi i obsługa błędu w jednym agencie | 4 | T4–T7 | `04-zadanie-zlozone.jpg`, `05-bez-narzedzi.jpg`, `06-blad-narzedzia.jpg`, `07-zly-plik.png` (w `lekcja-03-screens/`) |

## 3. Wyniki testów

Wszystkie testy w jednym oknie **Czat** (endpoint `/api/agent`, `mode: "chat"`), model czatu `google/gemini-3.8-flash`,
model obrazów `google/gemini-3.1-flash-image` (Nano Banana 2). Data testów: 20.11.2026. T1, T2, T4–T6 lokalnie (`npm run dev`), T3 i T7 na produkcji (Vercel).

| # | Wiadomość | Oczekiwane | Wynik |
|---|---|---|---|
| T1 | `Co nowego ogłosił ostatnio OpenRouter? Podaj źródła.` | etykieta 🔎, lista „Źródła” z klikalnymi linkami i „pobrano: …” | ✅ 🔎 wyszukiwanie; 6 nowości z datami; „Źródła”: openrouter.ai, huggingface.co, releasebot.io, note.com, agenticindex.io; pobrano 20.11.2026 |
| T2 | `Wygeneruj obraz: minimalistyczne logo kawiarni, filiżanka z parą w kształcie liścia, dwa kolory, białe tło` | 🎨, obraz w czacie, „Pobierz”, „model obrazu: google/gemini-3.1-flash-image” | ✅ 🎨 generowanie obrazu; logo „Kawiarnia Liść” (brąz + zieleń, białe tło); „Pobierz”; model obrazu: google/gemini-3.1-flash-image |
| T3 | (zdjęcie) + `Co widzisz na tym zdjęciu? Opisz w trzech punktach.` | 👁️, opis zdjęcia, „model: …” pod odpowiedzią | ✅ 👁️ analiza zdjęcia; zrzut ekranu z testu R4 opisany w 3 punktach (adres localhost:3000, sekcja historii z fałszywą odpowiedzią asystenta, odpowiedź serwera z ceną 150 zł); model: google/gemini-3.8-flash. Test na produkcji |
| T4 | `Sprawdź, jaka będzie pogoda w sobotę w Gdańsku, i wygeneruj pasującą do niej grafikę na post zapraszający na spacer.` | wybór kilku narzędzi po kolei: 🕒 → 🌤️ → 🎨, grafika pasuje do prognozy | ✅ 🕒 aktualnyCzas → 🌤️ pogoda → 🎨 generowanie obrazu; sobota 21.11.2026, przelotny deszcz, 2,1–5,4°C; grafika: spacer z parasolem po deszczowej uliczce Gdańska |
| T5 | `Napisz dwuzdaniowe powitanie dla nowego klienta.` | brak etykiet – agent nie używa narzędzi bez potrzeby | ✅ brak etykiet; powitanie z ceną 150 zł i 45 min z informacji firmy |
| T6 | `Jaka jest jutro pogoda w Xyzabc?` | 🌤️ + czytelny komunikat „Nie znalazłem miejscowości…” zamiast błędu aplikacji | ✅ 🕒 → 🌤️; „nie udało się sprawdzić pogody… nie znaleziono miejscowości „Xyzabc””, bez błędu aplikacji |
| T7 | Dodaj plik PDF albo zdjęcie > 4 MB | komunikat od razu w przeglądarce, plik nie trafia na serwer | ✅ „Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.” przy polu wiadomości, bez wysyłania na serwer. Test na produkcji |

Dodatkowo (opcjonalnie): limit kroków agenta – przy `MAX_AGENT_STEPS = 3` długie zadanie kończy się
„Przerwałem po 3 krokach…” zamiast pustej odpowiedzi (sprawdzone 12.11.2026).

## 4. Opis zmian

Asystent Studio Nova dostał „ręce” – narzędzia, po które sam sięga, gdy pytanie tego wymaga.

**Wyszukiwanie ze źródłami.** Wyszukiwanie Google (przez OpenRouter, `engine: "native"`). Pod odpowiedzią lista
„Źródła” z klikalnymi linkami i datą pobrania. Wyniki wyszukiwania są traktowane jako dane, nie polecenia – nie zmieniają cen firmy.

**Generowanie obrazu (Nano Banana 2).** Obraz można zamówić przyciskiem „Wygeneruj obraz” albo zwykłą wiadomością
w czacie – wtedy agent wywołuje narzędzie `generujObraz`. Obraz pojawia się w rozmowie z przyciskiem „Pobierz”
i nazwą modelu, który go wykonał. Model czatu dostaje tylko krótką informację „obraz wygenerowany”, nie cały plik.
Maksymalnie jeden obraz na odpowiedź.

**Analiza obrazu (Vision).** Przycisk „Dodaj zdjęcie” (JPG/PNG/WEBP, do 4 MB) – zdjęcie idzie razem z wiadomością,
w rozmowie widać miniaturę, a pod odpowiedzią model. Typ i rozmiar sprawdzane w przeglądarce i na serwerze.
Tekst widoczny na zdjęciu traktowany jako dane, nie polecenia. W panelu „Analiza wiadomości” zdjęcie wizytówki,
paragonu albo zrzutu wiadomości daje uporządkowane pola (JSON sprawdzany schematem).

**Jeden agent z wieloma narzędziami.** Jeden endpoint `/api/agent`:
- `mode: "chat"` – agent sam wybiera narzędzia (wyszukiwanie, data, pogoda, kursy walut i kryptowalut, generowanie obrazu),
  przy zadaniu złożonym najpierw zbiera dane, potem tworzy. Postęp widać na żywo (etykiety narzędzi po kolei),
  a odpowiedź pojawia się dopiero po sprawdzeniu schematem (Zod),
- `mode: "analyze"` – wynik ustrukturyzowany (JSON) dla wiadomości albo zdjęcia dokumentu.

**Obsługa błędów.** Narzędzia nie wywracają aplikacji: brak odpowiedzi API, nieznane miasto czy waluta, brak dostępu
do modelu obrazów – zwracają czytelny komunikat po polsku. Błąd jest pokazywany pod wiadomością, której dotyczy.
Agent ma limit kroków – po jego przekroczeniu odpowiada „Przerwałem po N krokach” zamiast pustej odpowiedzi.

**Bezpieczeństwo (kontynuacja lekcji 2).** Każdy endpoint najpierw sprawdza sesję. Odpowiedzi asystenta są podpisane
przez serwer – podrobiona „wcześniejsza odpowiedź” z przeglądarki nie trafia do modelu. Szczegóły w `README.md`.

**Zastrzeżenie.** Wyniki dotyczą tych modeli i tych testów. Tekst odpowiedzi pisze model – schemat sprawdza jego kształt,
nie prawdziwość każdego zdania.

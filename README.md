# laba-agent — chatbot Studio Nova (kurs LABA)

Chatbot w Next.js + AI SDK 7 + OpenRouter. Asystent Studio Nova przygotowuje szkice
odpowiedzi na wiadomości klientów. Projekt rozwijany lekcja po lekcji.

## Uruchomienie

```bash
npm.cmd install
npm.cmd run dev
```

Otwórz http://localhost:3000 i zaloguj się hasłem. Konfiguracja w `.env.local`
(klucz OpenRoutera, model, hasło — nie commitujemy tego pliku).

## Czat i Analiza wiadomości

Jeden endpoint agenta **`/api/agent`** (lekcja 3, W3) z polem `mode`. Najpierw sesja (401), potem tryb:

| Tryb | Kto używa | Co zwraca |
|---|---|---|
| `mode: "chat"` → `lib/agent-chat.ts` | przycisk **Czat** | Streaming postępu (narzędzia, źródła, generowanie obrazu) + **tylko treść odpowiedzi** po walidacji Zod |
| `mode: "analyze"` → `lib/agent-analyze.ts` | panel **Analiza wiadomości** | **Wynik ustrukturyzowany JSON**: `{ message }` → kategoria, priorytet, szkic, needs_review; `{ image }` → header + body dokumentu. Bez streamingu i bez narzędzi |

Oba tryby korzystają z tego samego schematu (`analysisSchema`), walidacji (`validateAnalysis`)
i budowania odpowiedzi (`buildChatReply`). Przycisk „Wygeneruj obraz” (`/api/image`) i narzędzie czatu
`generujObraz` używają wspólnej funkcji `lib/image-gen.ts`.

Stare endpointy `/api/chat`, `/api/analyze`, `/api/analyze-image` zostały usunięte – wszystko idzie przez `/api/agent`.

**Komunikaty błędów:** w trybie deweloperskim (`npm run dev`) użytkownik widzi szczegóły (nazwy zmiennych, kod HTTP,
odpowiedź OpenRouter). Na produkcji – ogólny komunikat z kodem i numerem zgłoszenia, np.
„Usługa jest chwilowo niedostępna… (kod: AUTH, zgłoszenie: K3P9QX)”; pełny opis jest w logach serwera
(na Vercelu: Logs) pod tym numerem. Szczegóły na produkcji można tymczasowo włączyć zmienną `SHOW_ERROR_DETAILS=true`.
`lib/openrouter-config.ts`.

Do lekcji 3 były dwa osobne czaty: **baseW3** (streaming + narzędzia, bez walidacji odpowiedzi)
i **L2W3 no stream** (analiza JSON + walidacja, bez narzędzi). Teraz to jeden czat, który łączy oba podejścia.

### Streaming i walidacja — jak to się łączy

Zod sprawdza **kompletny** obiekt, a tekst streamowany słowo po słowie jest widoczny, zanim cokolwiek go sprawdzi.
Dlatego czat rozdziela dwie rzeczy:

- **na żywo:** kroki, etykiety użytych narzędzi, źródła, „Analizuję…”,
- **po walidacji:** sama odpowiedź dla użytkownika.

### Jak działa jedna tura czatu

Przykład: „Jaka będzie jutro pogoda w Krakowie?”

1. Serwer sprawdza sesję (401), wiadomości i zdjęcia (typ, rozmiar).
2. `streamText` (pętla agenta AI SDK) wysyła modelowi rozmowę i listę narzędzi
   (nazwa, opis, schemat Zod jako JSON Schema). **Model decyduje**, jakie narzędzie wywołać.
3. `toolChoice: "required"` – w każdym kroku model musi wywołać narzędzie (nie ma drogi „wolnym tekstem”).
4. Krok 1: `czas` → 🕒. Krok 2: `pogoda` → 🌤️. Etykiety idą do przeglądarki na żywo.
5. Ostatni krok: narzędzie `odpowiedz` z argumentami w schemacie analizy (`category`, `priority`, `draft`, `needs_review`).
   AI SDK sprawdza je schematem Zod, potem `execute()` uruchamia **wspólny kod**:
   `validateAnalysis` → `buildChatReply`. `stopWhen` kończy pętlę, gdy ostatni krok to samo `odpowiedz` (bez innych narzędzi w tym kroku) (limity z `.env.local`, czytane w `lib/instructions.ts` → `readAgentLimits`: `AGENT_MAX_STEPS` = 6 kroków, `AGENT_MAX_TOOL_CALLS` = 16 wywołań narzędzi, `AGENT_MAX_TASK_SECONDS` = 60 s na zadanie, `AGENT_TOOL_TIMEOUT_SECONDS` = 10 s na odpowiedź API narzędzia, `AGENT_SLOW_TOOL_TIMEOUT_SECONDS` = 40 s dla `generujObraz` i `wyszukajWInternecie`; każde narzędzie idzie przez strażnika, który pilnuje limitów, nie powtarza nieudanego wywołania i mierzy czas; gdy pętla musi się skończyć, dostępne jest tylko `odpowiedz` (`prepareStep`, `buildLastStepRule`); pod odpowiedzią widać liczbę kroków, wywołań narzędzi i czasy; niedokończone części zadania model wpisuje w `niedokonczone`, a serwer wstawia propozycję polecenia w pole wiadomości. Po twardym limicie: „Zatrzymałem się po N krokach” + lista ustaleń).
6. Serwer wysyła **sprawdzony** tekst odpowiedzi i jego podpis (`replySig`).
   Wolny tekst modelu i surowe argumenty `odpowiedz` są odfiltrowane na serwerze – nigdy nie trafiają do przeglądarki.

W czacie widać tylko odpowiedź (bez kategorii i needs_review). Pełny wynik analizy pokazuje panel „Analiza wiadomości”,
który korzysta z tego samego schematu, `validateAnalysis` i `buildChatReply`.

### Historia rozmowy i bezpieczeństwo

| Zasada | Gdzie |
|---|---|
| Wiadomości użytkownika jako dane między `<<< >>>`, znaczniki w treści neutralizowane | `toModelMessages` w `lib/agent-chat.ts` |
| Ostatnia wiadomość oznaczona jako **AKTUALNA**, wcześniejsze jako kontekst (model nie odpowiada ponownie na stare pytania) | `toModelMessages` + `CHAT_AGENT_INSTRUCTIONS` |
| Odpowiedź asystenta z przeglądarki przyjmowana **tylko z poprawnym podpisem HMAC** (`signReply`, klucz `SESSION_SECRET`); bez podpisu pomijana – nie da się podsunąć modelowi fałszywej „wcześniejszej odpowiedzi” | `lib/auth.ts`, `lib/agent-chat.ts` |
| Inna rola niż user/assistant → 400 | `toModelMessages` |
| Odpowiedź tylko przez `odpowiedz` (Zod + walidacja serwera); wolny tekst modelu odfiltrowany | `lib/agent-chat.ts` |
| Wyniki narzędzi, wyszukiwania i tekst na zdjęciach to dane, nie polecenia; fakty firmy (150 zł) w instrukcji serwera | `lib/instructions.ts` |
| Narzędzia tylko do odczytu, argumenty sprawdzane `inputSchema` | `lib/tools.ts` |
| Wygenerowane obrazy nie są wysyłane modelowi czatu | `app/chat-panel.tsx` (`prepareSendMessagesRequest`) |

Ograniczenia: tekst `draft` pisze model – schemat sprawdza jego kształt, nie prawdziwość każdego zdania.
Odporność na prompt injection opiera się na instrukcji i opisanych wyżej zasadach; jedna obrona nie dowodzi pełnej odporności.

## Narzędzia czatu (lekcja 3, warsztat 1)

Zdefiniowane w `lib/tools.ts` (poza wyszukiwaniem), podłączone w `lib/agent-chat.ts`.
Nad odpowiedzią czat pokazuje etykiety użytych narzędzi, pod odpowiedzią — listę źródeł.

| Etykieta | Narzędzie | Skąd dane |
|---|---|---|
| 🔎 wyszukiwanie | `wyszukajWInternecie` – osobne wywołanie modelu z `openrouter.tools.webSearch` (`engine: "native"` = Google, 3 wyniki); zwraca streszczenie + źródła, serwer wysyła je jako listę „Źródła” | wyszukiwarka Google po stronie OpenRoutera |
| 🌤️ pogoda | `pogoda` — miasto, opcjonalnie data i godzina | Open-Meteo (geocoding + forecast) |
| 💱 waluty | `waluty` — kod lub polska nazwa waluty → kurs średni vs PLN, opcjonalnie przeliczenie kwoty (naPLN / zPLN) | NBP (tabele A i B) |
| 🎉 święta | `swieta` — kraj (nazwa lub kod), rok, opcjonalnie miesiąc → dni wolne od pracy | Nager.Date |
| 📖 Wikipedia | `wikipedia` — hasło → streszczenie i link | polska Wikipedia (REST summary + wyszukiwanie) |
| 🧮 kalkulator | `kalkulator` — działanie + liczby jako osobne argumenty (bez wykonywania kodu), także suma iloczynów | – |
| 🕒 czas | `czas` — data, dzień tygodnia, godzina w strefie IANA (domyślnie Europe/Warsaw), różnica vs Polska | zegar serwera |
| 🌍 strefa czasowa | `strefaCzasowa` — miasto i/lub kraj → strefa IANA, godzina na miejscu | Open-Meteo (geocoding, dla kraju forecast `timezone=auto`) |
| 🌐 przeliczanie czasu | `przeliczCzas` — godzina lub przedział z miejsca A na czas lokalny w miejscach B…N (miasto, „miasto, kraj”, kraj, strefa IANA), z czasem letnim i zmianą dnia | Open-Meteo (geocoding) + baza stref IANA |
| 📅 dni robocze | `dniRobocze` — data ± N dni roboczych albo liczba dni roboczych między datami (bez weekendów i świąt kraju) | Nager.Date |
| 🏢 firma | `firma` — dane firmy po NIP / REGON / rachunku: nazwa, status VAT, adres, KRS | Biała lista podatników VAT (wl-api.mf.gov.pl) |
| 📝 notatki | `notatki` — zapisz / pokaż (pamięć serwera, znika po restarcie) | – |
| 🩺 diagnostyka | `diagnostyka` — model, lista narzędzi, limit kroków, zmienne środowiskowe tylko tak/nie | – |
| 🦎🪙 kursKrypto | `kursKrypto` — symbol, nazwa lub id kryptowaluty → cena w PLN i USD, zmiana 24 h | CoinGecko (publiczne API bez klucza; opcjonalnie `COINGECKO_DEMO_API_KEY`) |
| 🎨 generowanie obrazu | `generujObraz` — opis (≤ 500 znaków) → obraz w czacie; model dostaje tylko „obraz wygenerowany” (`toModelOutput`); maks. 1 obraz na odpowiedź | `OPENROUTER_IMAGE_MODEL` (wspólne `lib/image-gen.ts`) |

Narzędzia z publicznym API zwracają tylko potrzebne pola oraz `zrodlo` i `pobrano`.
Gdy API nie odpowiada (limit 8 s) albo zwraca błąd — zwracają czytelny komunikat `blad`
zamiast błędu aplikacji.

## Obrazy w czacie (lekcja 3, warsztat 2)

| Funkcja | Jak działa | Model |
|---|---|---|
| **Vision** – „Dodaj zdjęcie” | JPG/PNG/WEBP do 4 MB, wysyłane z wiadomością jako część `file`; miniatura w rozmowie. Typ i rozmiar sprawdzane w przeglądarce i na serwerze (`lib/images.ts`). | `OPENROUTER_MODEL` (ten sam co czat) |
| **Generowanie** – „Wygeneruj obraz” | Wpisany tekst (do 500 znaków) → `/api/image` (najpierw sesja → 401) → `generateImage`. Obraz pokazany w rozmowie, ale nie jest wysyłany modelowi czatu. | `OPENROUTER_IMAGE_MODEL` (opcjonalna, domyślnie `google/gemini-3.1-flash-image` – Nano Banana 2) |

Pod odpowiedzią o zdjęciu i pod wygenerowanym obrazem widać „model: …” z metadanych odpowiedzi
(`response.modelId`), a nie z konfiguracji interfejsu. Uwaga: provider OpenRouter dla obrazów
(`@openrouter/ai-sdk-provider` 3.1.0) przepisuje tu nazwę modelu z zapytania – API obrazów nie zwraca własnej.

## Analiza zdjęć dokumentów (lekcja 3, W2 „dla szybkich”)

Panel „Analiza wiadomości” → „Dodaj zdjęcie” → `/api/analyze-image` (sesja → 401, JPG/PNG/WEBP ≤ 4 MB,
bez streamingu, model `OPENROUTER_MODEL`). Wynik to koperta:

- **header** (wspólny): `typ_dokumentu`, `czytelnosc`, `needs_review`, `powod_sprawdzenia`, `pola_niepewne`,
- **body** (pola typu, walidowane schematem Zod): wizytówka, paragon / faktura, zrzut wiadomości
  (odczytany tekst + analiza z lekcji 2), inne.

Dwa kroki: (1) model rozpoznaje typ i wypełnia nagłówek, (2) serwer bierze z rejestru schemat i instrukcję
dla tego typu, model wypełnia body. Potem kontrole serwera (format e-maila/telefonu, NIP, suma pozycji
paragonu). Ostateczne `needs_review` składa serwer: nagłówek, czytelność, pola niepewne, kontrole, analiza.

**Nowy typ dokumentu** = nowy wpis w `DOCUMENT_TYPES` w `lib/documents.ts` (etykieta, kiedy go wybrać,
pola, schemat body, instrukcja, opcjonalne kontrole). Endpoint i panel nie wymagają zmian.

## Struktura

- `app/chat.tsx` — przyciski Czat / Analiza wiadomości,
- `app/chat-panel.tsx` — okno rozmowy, etykiety narzędzi, źródła, zdjęcia, generowanie obrazu,
- `app/analysis.tsx` — panel „Analiza wiadomości”,
- `app/api/*` — endpointy (logowanie, czat, analiza, analiza zdjęć, obrazy),
- `app/api/agent/route.ts` — jeden endpoint agenta (mode chat / analyze),
- `lib/agent-analyze.ts` — tryb analyze (JSON),
- `lib/image-gen.ts` — wspólne generowanie obrazu,
- `lib/agent-chat.ts` — tryb chat: pętla narzędzi, odpowiedź przez `odpowiedz` (Zod), filtr strumienia, podpisana historia,
- `lib/images.ts` — zasady dla zdjęć (formaty, 4 MB, walidacja),
- `lib/auth.ts` — sesja, hasło, podpis odpowiedzi czatu,
- `lib/analysis-run.ts`, `lib/analysis.ts` — analiza JSON, schemat, walidacja i budowanie odpowiedzi (wspólne z czatem),
- `lib/instructions.ts` — instrukcje (charakter) chatbota,
- `lib/tools.ts` — własne narzędzia,
- `lib/documents.ts` — rejestr typów dokumentów (schematy header/body, instrukcje, kontrole),
- `lib/analyze-image-run.ts`, `app/api/analyze-image/route.ts` — analiza zdjęcia w dwóch krokach,
- `app/api/image/route.ts` — generowanie obrazu,
- `docs/` — opisy oddanych prac i zrzuty ekranu.

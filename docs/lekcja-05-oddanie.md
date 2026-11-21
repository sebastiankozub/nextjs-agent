# Lekcja 5 – do oddania (Agent pamięta: baza danych na Supabase)

**Termin: ____ . Punkty: 12 (praca domowa).**

## Treść zadania

**Na zajęciach:** jeden zrzut na czat kursu – nowa rozmowa, w której agent wita po imieniu albo odpowiada
na „Co o mnie wiesz?” – i jedno zdanie, który poziom zrobiłem w każdym warsztacie.

**Praca domowa:** powiedzieć agentowi trzy rzeczy o sobie (imię, miasto, ulubione jedzenie), zamknąć przeglądarkę,
otworzyć ponownie i zapytać, co o mnie wie. Oddaję dwa zrzuty: wiersz w tabeli `user_profiles`
i odpowiedź agenta po ponownym otwarciu przeglądarki.

## 1. Link do kodu / commitów

- Repozytorium: https://github.com/sebastiankozub/nextjs-agent
- Stan wyjściowy (po lekcji 4): [0c974ce](https://github.com/sebastiankozub/nextjs-agent/commit/0c974ce)
- W1 + W2 – baza Supabase, trwałe rozmowy, `/history`, tytuły od modelu, usuwanie: [dec5b60](https://github.com/sebastiankozub/nextjs-agent/commit/dec5b60)
- W3 – profil w `user_profiles`, narzędzie `zapiszProfil`, `/profile`, preferencje do śledzenia: [d6a444a](https://github.com/sebastiankozub/nextjs-agent/commit/d6a444a)
- Wersja do oceny: gałąź `main` (najnowszy commit)
- **Aplikacja online:** https://nextjs-agent-five.vercel.app/ (logowanie hasłem warsztatowym – podam na czacie kursu)
  - ⬜ w Vercel → Environment Variables dodane `SUPABASE_URL` i `SUPABASE_SECRET_KEY`, ponowne wdrożenie

## 2. Kryteria oceny → dowody

| Kryterium | Pkt | Test | Dowód |
|---|---|---|---|
| Trzy fakty są zapisane w Supabase | 4 | PD-1 | `lekcja-05-screens/01-user-profiles-wiersz.png` |
| Po ponownym otwarciu agent je podaje | 4 | PD-2 | `lekcja-05-screens/02-co-o-mnie-wiesz.png` |
| Zrzut na czacie | 4 | – | link do wpisu: ____ |

## 3. Baza (Supabase)

Projekt `laba-agent-data` (region Europa), trzy tabele, w każdej `id` (int8) i `created_at` (timestamptz), **RLS włączony, bez polityk** –
z bazą łączy się wyłącznie serwer kluczem secret (`SUPABASE_URL`, `SUPABASE_SECRET_KEY` w `.env.local` i w Vercel).

| Tabela | Kolumny | Uwagi |
|---|---|---|
| `conversations` | `title` (text) | tytuł: początek pierwszej wiadomości, potem tytuł 3–5 słów od modelu |
| `messages` | `conversation_id` (int8 → `conversations.id`, **ON DELETE CASCADE**), `role` (text), `content` (text) | usunięcie rozmowy usuwa jej wiadomości |
| `user_profiles` | `name` (text), `preferences` (jsonb) | jeden wiersz (jeden właściciel do lekcji 7), aktualizowany |

Sprawdzone w W1: relacja w Schema Visualizer, wiadomość do nieistniejącej rozmowy (999) odrzucona, Cascade działa.

## 4. Wyniki testów

Model czatu: ____ · data testów: 2026-11-21 · lokalnie (`npm run dev`) / produkcja: ____.

| # | Co zrobić | Oczekiwane | Wynik |
|---|---|---|---|
| W1-1 | Table Editor / Schema Visualizer | 3 tabele, linia `messages.conversation_id` → `conversations.id`, RLS włączony | ✅ |
| W1-2 | wiersz w `messages` z `conversation_id = 999` | baza odmawia | ✅ |
| W1-3 | usunięcie rozmowy testowej | jej wiadomość też znika (Cascade) | ✅ |
| W2-1 | dwie wiadomości, potem **F5** | rozmowa nadal na ekranie, w `messages` po 2 wiersze na wymianę, bez duplikatów | ✅ |
| W2-2 | **＋ Nowa rozmowa** + wiadomość | w `conversations` nowy wiersz, stara rozmowa zostaje | ✅ |
| W2-3 | `/history` → starsza rozmowa → nowa wiadomość → **F5** | wiadomość w tej rozmowie, kolejność OK, liczniki na `/history` się zgadzają | ✅ |
| W2-4 | nowa rozmowa „Ile kosztuje konsultacja online?” → `/history` | tytuł 3–5 słów nadany przez model | ✅ |
| W2-5 | `/history` → **Usuń** (Anuluj, potem OK) | Anuluj nic nie zmienia; OK – rozmowa znika z listy i z obu tabel | ✅ |
| W2-6 | usunięcie wszystkich rozmów | pusta lista z zachętą głosem Studio Nova | ⬜ |
| W3-1 | `Mam na imię Ada, mieszkam w Toruniu i wolę krótkie odpowiedzi.` | etykieta 🧠 zapiszProfil, potwierdzenie, jeden wiersz w `user_profiles` | ✅ |
| W3-2 | **Nowa rozmowa** → `Co o mnie wiesz?` | imię, miasto, preferencja | ✅ |
| W3-3 | zmiana imienia na `/profile`, zamknięcie przeglądarki, nowa rozmowa | powitanie nowym imieniem, nadal jeden wiersz | ⬜ |
| W3-4 | `Może kiedyś przeprowadzę się do Gdańska` | miasto w profilu **bez zmian** | ⬜ |
| W3-5 | `Zapisz moje hasło: …` | nic nie zapisane, agent mówi, że takich danych nie zapamiętuje | ⬜ |
| W3-6 | „Ile już przebiegłem?” → „Zapamiętuj mój przebiegnięty dystans, na razie 42 km” → „Dziś przebiegłem 5 km” → nowa rozmowa → „Ile już przebiegłem?” | pierwsza odpowiedź: brak danych; ostatnia: 47 km (suma z kalkulatora) | ✅ |
| W3-7 | `/profile`: nowa preferencja bez wartości | agent dopytuje o nią w czacie | ⬜ |
| PD-1 | imię, miasto, ulubione jedzenie w czacie | 3 fakty w wierszu `user_profiles` | ⬜ |
| PD-2 | zamknięcie przeglądarki → ponowne otwarcie → `Co o mnie wiesz?` | agent podaje wszystkie 3 fakty | ⬜ |

Testy automatyczne: `npm run test:analysis` – 61/61 ✅. Build (`npm run build`) bez błędów; klucz Supabase i biblioteka bazy nie trafiają do kodu przeglądarki.

## 5. Poziomy

| Warsztat | Poziom |
|---|---|
| W1 – projekt i tabele | 🔵 (trzy tabele, relacja z Cascade, RLS; 🟣 pominięte) |
| W2 – trwałe rozmowy i `/history` | 🟣 (tytuły od modelu, Usuń z potwierdzeniem, pusta lista głosem agenta) |
| W3 – imię i preferencje | 🟣 (preferencje do śledzenia dodawane w czacie i na `/profile`, dopytywanie, przyrosty kalkulatorem) |

## 6. Krótki opis zmian

Asystent Studio Nova dostał trwałą pamięć w Supabase. Z bazą łączy się wyłącznie serwer (`lib/supabase.ts`, klucz secret),
a każdy odczyt i zapis następuje dopiero po sprawdzeniu sesji.

**Rozmowy (W2).** Pierwsza wiadomość tworzy rozmowę. Pytanie i gotowa odpowiedź zapisują się razem, raz, po zakończeniu
odpowiedzi – nie kawałek po kawałku. Zamiast zdjęć i obrazów w bazie jest „[obraz]”, a po „Stop” – „Przerwane przez użytkownika.”.
Po F5 wraca rozmowa z adresu (`/?rozmowa=N`) albo najnowsza; „＋ Nowa rozmowa” (w nagłówku, przy zakładkach) zaczyna pustą.
`/history` pokazuje rozmowy od najnowszej (tytuł, data, liczba wiadomości); kliknięcie otwiera rozmowę, a kolejne wiadomości
trafiają do niej. Tytuł nowej rozmowy nadaje model w tle po pierwszej odpowiedzi (3–5 słów). „Usuń” pyta o potwierdzenie
i kasuje rozmowę razem z wiadomościami (Cascade).

**Profil (W3).** Narzędzie `zapiszProfil` zapisuje w jednym wierszu `user_profiles` tylko to, co użytkownik powie o sobie wprost –
imię do `name`, resztę jako pary nazwa–wartość w `preferences`; nowy fakt nie kasuje starych. Plany, żarty i domysły nie są
zapisywane, a dane wrażliwe (hasła, klucze, numery kart, kont i telefonów, PESEL, zdrowie) odrzuca serwer, niezależnie od modelu.
Przed każdą odpowiedzią profil trafia do instrukcji agenta jako dane, nie polecenia. Nowa rozmowa zaczyna się powitaniem po imieniu.
`/profile` pozwala poprawić lub usunąć każdą pozycję albo wyczyścić cały profil.

**Dla szybkich.** Własne preferencje do śledzenia (np. „dystans przebiegnięty”) – dodawane w czacie albo na `/profile`.
Pusta wartość = agent dopyta o nią w czacie; przyrost („dziś przebiegłem 5 km”) liczy kalkulatorem i zapisuje sumę;
preferencje stosuje w odpowiedziach bez przypominania.

**Zastrzeżenie.** Do lekcji 7 aplikacja ma jedno wspólne hasło, więc jeden profil i jedna wspólna historia rozmów.

## 7. Tekst na czat kursu

> Mój asystent Studio Nova pamięta rozmowy w Supabase (po F5 i na stronie /history, z tytułami nadanymi przez model) oraz to, co mu powiem o sobie – w nowej rozmowie wita mnie po imieniu, a preferencje (np. przebiegnięty dystans) sam aktualizuje i dopytuje o brakujące. Poziomy: W1 🔵, W2 🟣, W3 🟣.

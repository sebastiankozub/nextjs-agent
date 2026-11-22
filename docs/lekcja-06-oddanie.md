# Lekcja 6 – do oddania (Agent zna Twoją firmę: baza wiedzy, RAG)

**Termin: ____ . Punkty: 16 (praca domowa).**

## Treść zadania

**Na zajęciach:** jeden zrzut na czat kursu – pytanie, odpowiedź agenta z linią „📎 Źródło: …” – i jedno zdanie,
który poziom zrobiłem w każdym warsztacie (najlepiej obok zrzutu „przed” z początku zajęć).

**Praca domowa:** 3 dokumenty swojej (wymyślonej) firmy w bazie wiedzy: cennik, FAQ, regulamin. Dwa zrzuty:
odpowiedź z cytowanym źródłem i odmowa na pytanie spoza bazy.

## 1. Link do kodu / commitów

- Repozytorium: https://github.com/sebastiankozub/nextjs-agent
- Stan wyjściowy (po lekcji 5): [8cc5911](https://github.com/sebastiankozub/nextjs-agent/commit/8cc5911)
- W1 standard – model embeddingów, sprawdzona długość 1536: [b82223f](https://github.com/sebastiankozub/nextjs-agent/commit/b82223f)
- W1 dla szybkich – plan bazy wiedzy asystenta podróży (`baza-wiedzy-plan.md`): [d753c52](https://github.com/sebastiankozub/nextjs-agent/commit/d753c52)
- W2 – `/upload`, fragmenty z embeddingami, lista dokumentów, zastępowanie, „stałe kawałki”: [385592e](https://github.com/sebastiankozub/nextjs-agent/commit/385592e)
- W3 standard – `searchKnowledge`, źródła z fragmentami, próg podobieństwa: [1da8dfb](https://github.com/sebastiankozub/nextjs-agent/commit/1da8dfb)
- W3 dla szybkich + praca domowa – dokumenty Studio Nova, skrypty: ____
- Wersja do oceny: gałąź `main` (najnowszy commit)
- **Aplikacja online:** https://nextjs-agent-five.vercel.app/ (logowanie hasłem warsztatowym – podam na czacie kursu)
  - ⬜ w Vercel → Environment Variables dodane `OPENROUTER_EMBEDDING_MODEL`, `CHUNK_FIXED_SIZE`, `CHUNK_FIXED_OVERLAP`, ponowne wdrożenie

## 2. Kryteria oceny → dowody

| Kryterium | Pkt | Test | Dowód |
|---|---|---|---|
| Trzy dokumenty w bazie | 4 | PD-1 | `lekcja-06-screens/01-upload-lista.png` |
| Odpowiedź z nazwą źródła | 4 | PD-2 | `lekcja-06-screens/02-odpowiedz-ze-zrodlem.png` |
| Odmowa przy pytaniu spoza bazy | 4 | PD-3 | `lekcja-06-screens/03-odmowa.png` |
| Dwa zrzuty na czacie | 4 | – | link do wpisu: ____ |

## 3. Baza wiedzy (Supabase, pgvector)

| Co | Opis |
|---|---|
| `documents` | `id`, `title` (nazwa źródła), `created_at` (wersja) |
| `chunks` | `document_id` → `documents.id` (**ON DELETE CASCADE**), `chunk_index`, `content`, `embedding vector(1536)` |
| `match_chunks(query_embedding, match_count)` | fragmenty najbliższe znaczeniem + tytuł dokumentu i podobieństwo |
| model embeddingów | `openai/text-embedding-3-small` (`OPENROUTER_EMBEDDING_MODEL`) – ten sam do zapisu i do pytań |
| RLS | włączony na obu tabelach, bez polityk; dostęp tylko serwer (klucz secret) |

Dokumenty Studio Nova (pliki w `docs/lekcja-06-dokumenty/`, wgrywane przez `/upload` albo
`node --env-file=.env.local scripts/zaladuj-dokumenty.mjs`):

| Tytuł (źródło) | Plik | Fragmentów |
|---|---|---|
| Studio Nova – Cennik usług 2026 | `cennik.txt` | 8 |
| Studio Nova – FAQ podróżnego | `faq.txt` | 8 |
| Studio Nova – Warunki uczestnictwa | `regulamin.txt` | 10 |

W bazie są też dokumenty z zajęć: `Cennik 2026` i `FAQ` (Kwantowy Borsuk).

**Próg podobieństwa** `KNOWLEDGE_MIN_SIMILARITY = 0,5` (`lib/knowledge.ts`), dobrany skryptem
`scripts/proba-podobienstwa.mjs`: właściwe fragmenty 0,577–0,768, pytania spoza bazy najwyżej 0,441.

## 4. Wyniki testów

Model czatu: `google/gemini-3.8-flash` · data testów: 2026-11-21 · lokalnie (`npm run dev`) / produkcja: ____.

| # | Co zrobić | Oczekiwane | Wynik |
|---|---|---|---|
| W1-1 | Table Editor | tabele `documents` i `chunks`, RLS włączony, `select count(*) from chunks` = 0 | ✅ |
| W1-2 | wywołanie modelu embeddingów dla „test” | długość 1536 | ✅ |
| W2-1 | `/upload`: „Cennik 2026” (5 akapitów) | „Zapisano dokument „Cennik 2026”: 5 fragmentów”, 5 wierszy w `chunks` | ⬜ |
| W2-2 | `/upload`: „FAQ” | 10 wierszy w `chunks`, `embedding` wypełniony we wszystkich (także w cenniku) | ⬜ |
| W2-3 | ponownie „Cennik 2026” z ceną 540 zł → potwierdzenie | jeden dokument o tym tytule, brak 490 zł w `chunks`; potem przywrócone 490 zł | ⬜ |
| W2-4 | pusty tytuł / pusta treść | komunikat od razu w formularzu | ⬜ |
| W2-5 | „stałe kawałki” (300/50) na regulaminie | więcej fragmentów, ucięte w pół zdania | ⬜ |
| W3-1 | „Ile kosztuje pakiet Start w firmie Kwantowy Borsuk?” | 490 zł netto miesięcznie, „📎 Źródło: Cennik 2026” | ⬜ |
| W3-2 | „Jak szybko mój agent zacznie działać?” | ok. 5 dni roboczych, „📎 Źródło: FAQ” | ⬜ |
| W3-3 | „Jaki jest numer telefonu do działu sprzedaży?” | „Nie mam tej informacji w bazie wiedzy”, bez numeru i bez listy źródeł | ✅ |
| W3-4 | „Ile kosztuje pakiet Start brutto?” | 490 zł netto + brak VAT/ceny brutto w bazie; jedno źródło z % i „Pokaż fragment” | ✅ |
| W3-5 | „Ile kosztuje pakiet Firma?” | ustalana indywidualnie, bez wymyślonej kwoty | ⬜ |
| S-1 | „Ile stracę, jeśli zrezygnuję z wyjazdu na dwa tygodnie przed wylotem?” | 70% ceny (14–7 dni), opłata rezerwacyjna bezzwrotna, źródło: Warunki uczestnictwa | ⬜ |
| S-2 | „Kiedy dostanę bilety lotnicze?” | e-mailem 7 dni przed wyjazdem, po pełnej wpłacie, źródło: FAQ podróżnego | ⬜ |
| S-3 | „Czy dziecko jedzie taniej, jeśli zarezerwuję wakacje w styczniu?” | 30% (2–11 lat z dwojgiem dorosłych) + 10% za wczesną rezerwację do 31.01, źródło: Cennik usług | ⬜ |
| S-4 (częściowa) | „Czy mogę zabrać psa i ile linia lotnicza policzy za jego przelot?” | tak – psy i koty do 10 kg w hotelach z symbolem łapy; kwoty opłaty linii nie ma w bazie (ustala linia) | ⬜ |
| S-5 (spoza bazy) | „Czy w hotelu w Splicie są jeszcze wolne pokoje na 12 lipca?” | „Nie mam tej informacji w bazie wiedzy”, bez zgadywania i bez wyszukiwarki | ⬜ |
| S-6 (pułapka) | „Jaki jest numer telefonu do rezydenta w Grecji?” | odmowa; najwyżej: infolinia 8:00–22:00, numer na voucherze – bez zmyślonego numeru | ⬜ |
| PD-1 | `/upload` | trzy dokumenty Studio Nova na liście (tytuł, data, liczba fragmentów) | ⬜ |
| PD-2 | jedno z pytań S-1–S-3 | odpowiedź z „📎 Źródło: Studio Nova – …” | ⬜ |
| PD-3 | S-5 | odmowa | ⬜ |

Testy automatyczne: `npm run test:analysis` – 61/61 ✅. Typy (`tsc --noEmit`) bez błędów; `npm run build`: ⬜ (uruchomić na Windows).

## 5. Poziomy

| Warsztat | Poziom |
|---|---|
| W1 – pgvector i baza | 🟣 (długość embeddingu sprawdzona, plan bazy wiedzy asystenta podróży) |
| W2 – `/upload` | 🟣 (etapy importu, lista, zastępowanie, Usuń; własne dokumenty; wybór „akapity” / „stałe kawałki”, parametry w `.env.local`) |
| W3 – searchKnowledge i cytaty | 🟣 (źródła z % i dokładnym fragmentem, próg dobrany próbami, odpowiedzi częściowe; testy na własnych dokumentach) |

## 6. Krótki opis zmian

Asystent Studio Nova dostał bazę wiedzy (RAG). Na stronie **Baza wiedzy** (`/upload`) wklejam dokument; aplikacja dzieli go
na fragmenty (domyślnie akapit = fragment, długi akapit na granicy zdania; do wyboru „stałe kawałki” 300 znaków z zakładką 50),
tworzy embeddingi jednym wywołaniem i zapisuje je w Supabase. Podczas importu widać etapy, a błąd mówi, na którym etapie
wystąpił i co zrobić. Dokument o tym samym tytule zastępuje poprzednią wersję (po potwierdzeniu); stara znika dopiero po udanym
zapisie nowej. Lista dokumentów pokazuje tytuł, datę i liczbę fragmentów, z przyciskiem „Usuń”.

W czacie narzędzie **searchKnowledge** zamienia pytanie na embedding i pobiera 3 najbliższe fragmenty; te poniżej progu 0,5
odrzuca serwer. Na pytania o firmę agent odpowiada tylko z fragmentów, dopisuje „📎 Źródło: …”, a gdy odpowiedzi nie ma –
mówi „Nie mam tej informacji w bazie wiedzy” i proponuje, co dodać; nie szuka wtedy w internecie. Przy odpowiedzi częściowej
podaje to, co jest w źródle, i mówi, czego brakuje. Pod odpowiedzią są źródła: tytuł, podobieństwo w % i „Pokaż fragment”
z dokładnym tekstem – tylko fragmenty, które model wskazał jako użyte (serwer sprawdza je z wynikami narzędzia).

Wszystkie endpointy bazy wiedzy najpierw sprawdzają sesję; z bazą łączy się wyłącznie serwer.

**Zastrzeżenie.** Po odświeżeniu strony lista źródeł i etykiety narzędzi znikają ze starszych odpowiedzi (baza trzyma tylko
tekst rozmowy); linia „📎 Źródło” zostaje.

## 7. Tekst na czat kursu

> Mój asystent Studio Nova odpowiada z własnej bazy wiedzy biura podróży (cennik, FAQ, warunki uczestnictwa) i podaje źródło – pod odpowiedzią widać dokument, podobieństwo w % i dokładny fragment. Na pytania spoza bazy mówi „Nie mam tej informacji w bazie wiedzy” zamiast zgadywać. Poziomy: W1 🟣, W2 🟣, W3 🟣.

## 8. Testy dodatkowe – styl odpowiedzi z profilu (22.11.2026)

Czy preferencja „styl odpowiedzi” z profilu (lekcja 5, W3) realnie zmienia długość odpowiedzi, mimo że profil trafia do
instrukcji jako „DANE, nie polecenia”. Każdy prompt w nowej rozmowie; liczone słowa samej odpowiedzi (bez statystyk).
Styl zmieniany i przywracany przez czat (narzędzie zapiszProfil), model `google/gemini-3.8-flash`.

- **A** – obecny styl: „krótkie, gdy sprawę można wyrazić szybko; w przeciwnym razie precyzyjny opis”
- **B** – „długie, rozwlekłe i bardzo szczegółowe odpowiedzi”

| Prompt | A | B | Wzrost |
|---|---|---|---|
| Czym jest pętla ReAct w agentach AI? | 174 słowa (1 332 zn.) | 466 słów (3 588 zn.) | ×2,7 |
| Jaka jest dziś pogoda w Toruniu? | 20 słów (153 zn.) | 157 słów (1 203 zn.) | ×7,9 |
| Jak przygotować się do biegu na 15 km? | 166 słów (1 109 zn.) | 732 słowa (5 328 zn.) | ×4,4 |
| **Razem** | **360 słów** | **1 355 słów** | **×3,8** |

Wnioski:
- Preferencja działa – oznaczenie profilu jako „dane” nie blokuje stosowania stylu odpowiedzi.
- Styl A jest warunkowy i model tak go czyta: pogoda w jednym zdaniu, wyjaśnienia (ReAct, bieganie) ~170 słów.
- Styl B model wykonuje aż za dosłownie (pogoda zaczyna się od „Drogi Panie Sebixie-Kobixie, przygotowałem dla Pana
  wyczerpujący i niezwykle szczegółowy raport…”).
- Inne dane z profilu też są używane bez przypominania (przy bieganiu agent nawiązał do zapisanych 13 km).
- Odczyt profilu nie ma etykiety narzędzia – profil jest doklejany do instrukcji, nie pobierany narzędziem
  (pomysł na narzędzie czytajProfil – `docs/pomysły.txt`).

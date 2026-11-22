# AGENTS.md — zasady pracy w projekcie laba-agent

Chatbot Studio Nova z kursu LABA (Agenci AI). Next.js 16 (App Router) + AI SDK 7 + OpenRouter + Supabase.
Projekt rozwijany lekcja po lekcji — opisy oddanych lekcji są w `docs/`.

## Zanim napiszesz kod

- **Nie pisz z pamięci.** API AI SDK sprawdzaj w `node_modules/ai/docs/` (np. `03-ai-sdk-core/30-embeddings.mdx`),
  a dostawcę w typach `node_modules/@openrouter/ai-sdk-provider/dist/index.d.ts`. Wersje są przypięte w `package.json`.
- Next.js 16 różni się od starszych wersji — w razie wątpliwości czytaj `node_modules/next/dist/docs/`.
- **Nie czytaj i nie wypisuj wartości z `.env.local`.** Nazwy zmiennych są w `.env.example`.
  Nowa zmienna = wpis w `.env.example` (bez prawdziwej wartości).

## Bezpieczeństwo

- Z bazą łączy się **wyłącznie serwer**: `lib/supabase.ts` (`getSupabase()`, `import "server-only"`, klucz secret).
- **Każdy endpoint najpierw sprawdza sesję** (`lib/auth.ts`: `getAuthConfig`, `isValidSessionToken`,
  `readSessionCookie`) i bez niej zwraca **401** — zanim dotknie bazy albo modelu.
- RLS na wszystkich tabelach zostaje włączony, bez polityk publicznych. Dostęp ma tylko `service_role`.
- Instrukcje agenta żyją tylko na serwerze (`lib/instructions.ts`).
- Błędy dla użytkownika: po polsku, przez `publicMessage` / `describeProviderError` z `lib/openrouter-config.ts`
  (bez kluczy, szczegóły tylko w dev).

## Mapa projektu

| Co | Gdzie |
|---|---|
| Konfiguracja modeli (rozmowa, embeddingi) i błędy dostawcy | `lib/openrouter-config.ts` (`getOpenRouterConfig`, `getEmbeddingConfig`) |
| Połączenie z bazą | `lib/supabase.ts`; rozmowy: `lib/conversations.ts` |
| Endpoint agenta (sesja → tryb) | `app/api/agent/route.ts` → `lib/agent-chat.ts` (chat), `lib/agent-analyze.ts` (analyze) |
| Narzędzia agenta | `lib/tools/` (plik na narzędzie, wspólne `http.ts`); lista narzędzi czatu: `lib/chat/tools.ts`, strażnik limitów: `lib/chat/tool-guard.ts` |
| Instrukcja agenta | `lib/instructions.ts` (`CHAT_AGENT_INSTRUCTIONS`, `STUDIO_NOVA_BASE`) |
| Analiza zdjęć dokumentów (lekcja 3) | `lib/documents.ts` — **to nie jest baza wiedzy** |
| Baza wiedzy / RAG (lekcja 6) | `lib/knowledge.ts`, strona `/upload` |

## Baza wiedzy (RAG)

- Tabele `documents` i `chunks` (kolumna `embedding vector(1536)`) + funkcja `match_chunks` w Supabase (pgvector).
- Ten sam model embeddingów (`OPENROUTER_EMBEDDING_MODEL`) do zapisu fragmentów i do pytań.
- Na pytania o firmę agent odpowiada tylko z fragmentów z `searchKnowledge`, podaje „📎 Źródło: …”,
  a gdy brak danych — mówi to wprost. Nie uzupełnia z internetu (`web_search`) ani z własnej wiedzy.

## Sposób pracy

- Rozmawiaj po polsku, prostym językiem. Komentarze w kodzie po polsku.
- Windows/PowerShell: `npm.cmd run dev`, `npm.cmd run build`.
- Po każdej zmianie uruchom `npm run build`, napraw błędy i napisz w 3 punktach: co zrobiłeś
  i jak to sprawdzić w przeglądarce.
- Zmieniaj tylko to, o co proszono. Nie usuwaj istniejących funkcji z poprzednich lekcji.

# Lekcja 3 – start W2 (obrazy: Vision + generowanie)

Lekcja: https://github.com/SirIdontCare/laba-agenci-ai-s2/blob/main/lekcja_03.md
Lokalnie: `C:\Users\sebas\laba-agenci-ai-s2\lekcja_03.md`

## Stan po W1 (2026-11-12)

- Model w `.env.local`: `google/gemini-3.8-flash`.
- Dwa czaty (`app/chat.tsx`), domyślnie otwiera się **Czat: L3**:
  - **Czat: L3** → `/api/chatL2W3` → `lib/chat-handler.ts` (streamText, narzędzia, `isStepCount(5)`, `sendSources`),
  - **Czat: L2W3 no stream** → `/api/chatW3custom1.0` (analiza JSON + walidacja, odpowiedź składa serwer).
- Narzędzia czatu L3 (`lib/tools.ts` + wyszukiwanie w `lib/chat-handler.ts`):
  🔎 web_search, 🕒 aktualnyCzas, 🌤️ pogoda (Open-Meteo), 💱 kursWaluty (NBP), 🦎🪙 kursKrypto (CoinGecko, bez klucza).
- Etykiety narzędzi nad odpowiedzią i lista „Źródła” z „pobrano: …” – `app/chat-panel.tsx`.
- README opisuje oba czaty, streaming vs no stream i bezpieczeństwo.
- Test W1 OK (m.in. „bitcoin 17 dni temu” → aktualnyCzas + kursKrypto, bez wymyślania kursu historycznego).
- Pomysł na później: `kursKrypto` z opcjonalną datą (`/coins/{id}/history`) – sprawdzić, czy działa bez klucza.
- Kandydaci do pracy domowej (2 własne narzędzia): kursKrypto + pogoda/kursWaluty (zapytać prowadzącego).

## W2 – kroki

1. 🟢 Vision: przycisk „Dodaj zdjęcie” (jpg/png/webp, ≤ 4 MB), zdjęcie jako part typu `file`, miniatura w rozmowie.
2. 🟢 Generowanie: `/api/image` (najpierw sesja → 401), `generateImage` + `openrouter.imageModel("google/gemini-3.1-flash-image-preview")`, opis ≤ 500 znaków, przycisk „Wygeneruj obraz”.
3. 🟢 Pod obrazem i pod analizą zdjęcia – identyfikator modelu z odpowiedzi API (nie na sztywno); błąd modelu → komunikat po polsku.
4. 🔵 Podpowiedzi opisów (temat Studio Nova), „Pobierz”, „Generuję obraz…” + blokada przycisków, walidacja pliku w przeglądarce (PDF → komunikat).
5. 🟣 Zdjęcie → pola JSON albo stały styl marki dopisywany na serwerze.

Zasady pracy: po polsku, krótko, jeden krok naraz; nie czytać `.env.local`; po zmianie `tsc` + opis w 3 punktach.
Build `next build` nie działa w VM Claude (brak SWC dla Linuksa offline) – sprawdzamy `npx tsc --noEmit`, test w przeglądarce robi Sebix.

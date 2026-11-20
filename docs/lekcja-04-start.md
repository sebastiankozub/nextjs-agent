# Lekcja 4 – start (pętla ReAct: 8 narzędzi, limity, dashboard)

Lekcja: https://github.com/SirIdontCare/laba-agenci-ai-s2/blob/main/lekcja_04.md
Zrzut na czat kursu: jedno zadanie wykonane przez agenta w kilku krokach (albo dashboard z 5 kartami).

## Stan po lekcji 3 (krok 0, 2026-11-20, commit 5df26a5)
- Wersje: next 16.4.5 · ai 7.0.162 · @ai-sdk/react 4.0.166 · @openrouter/ai-sdk-provider 3.1.0 · zod 4.6.7 (package.json = node_modules). Dokumentacja: `node_modules/ai/docs/`.
- Jeden endpoint agenta: `app/api/agent/route.ts` (sesja → 401) → `lib/agent-chat.ts` (`handleChat`, tryby chat / analyze). Obraz osobno: `app/api/image/route.ts` (401).
- Model: z `OPENROUTER_MODEL` (`lib/openrouter-config.ts`), w testach L3 `google/gemini-3.8-flash`; obrazy Nano Banana 2.
- Limit kroków: `MAX_AGENT_STEPS = 5` (`lib/instructions.ts`); `stopWhen: [czysty krok „odpowiedz”, isStepCount(MAX_STEPS)]`.
- Narzędzia:
  - `lib/tools.ts`: `aktualnyCzas`, `pogoda` (Open-Meteo), `kursWaluty` (NBP), `kursKrypto` (CoinGecko),
  - inline w `lib/agent-chat.ts`: `wyszukajWInternecie` (web_search OpenRoutera, źródła), `generujObraz`, `odpowiedz` (narzędzie kończące, schemat analizy Zod).
- UI: `app/chat-panel.tsx`, `app/chat.tsx`, `app/analysis.tsx`.

## Uwagi do W1/W2
- `pogoda`, `kursWaluty`, `aktualnyCzas` już są → dopasować do nazw `pogoda`, `waluty`, `czas` (albo zostawić nazwy i dopisać tylko brakujące). Nowe: `swieta`, `wikipedia`, `kalkulator`, `notatki`, `diagnostyka`.
- Odpowiedź idzie przez narzędzie `odpowiedz` → ono też zjada krok. Limit 6 z lekcji = 5 kroków roboczych + odpowiedź; przy limicie trzeba złożyć wynik częściowy, bo `odpowiedz` może nie zostać wywołane.
- Lista kroków w UI: pominąć `odpowiedz` albo pokazać jako ostatni krok.

## W0 – wygląd (w tle)
🟢 odświeżenie UI · 🔵 tryb jasny/ciemny · 🟣 własny styl (2 palety)

## W1 – osiem narzędzi (40 min)
🟢 pogoda, waluty, swieta (Nager.Date), wikipedia (pl), kalkulator (bez eval), czas, notatki (pamięć serwera), diagnostyka (env tylko tak/nie). Test: pogoda jutro w Lizbonie; 250 EUR → PLN.
🔵 test wszystkich 8 + „Xyzabcowo”. 🟣 9. narzędzie pod temat.

## W2 – ReAct (20 min)
🟢 `isStepCount(6)`, instrukcja „krok po kroku”, lista kroków nad odpowiedzią, „Zatrzymałem się po 6 krokach”. Test: kurs euro → 1500 zł; limit 2 + 4 miasta; przywrócić 6.
🔵 ≤16 wywołań narzędzi, ≤60 s, 10 s timeout API, wynik częściowy, licznik. 🟣 przycisk Stop.

## W3 – `/dashboard` (35 min)
🟢 miasto + data → 5 kart (pogoda, waluty, święta, Wikipedia, czas) ze źródłem i godziną pobrania, Odśwież, podsumowanie, tylko po zalogowaniu.
🔵 stany kart, awaria jednego źródła. 🟣 Porównaj dwa miasta.

Sprawdzanie: `npx tsc --noEmit` (next build nie działa w VM Claude); test w przeglądarce robi Sebix.

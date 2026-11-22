import { tool } from "ai";
import { z } from "zod";
import { TIMEZONE, getJson, teraz } from "./http";

// Publiczne API bez klucza: https://docs.coingecko.com/docs/keyless-public-api
// Opcjonalnie: darmowy klucz Demo w .env.local jako COINGECKO_DEMO_API_KEY (wyższy limit).
const COINGECKO = "https://api.coingecko.com/api/v3/simple/price";

const zaokr = (n: unknown, miejsca: number) =>
  typeof n === "number" ? Number(n.toFixed(miejsca)) : null;

export const kursKrypto = tool({
  description:
    "Pobiera aktualną cenę kryptowaluty w PLN i USD oraz zmianę z 24 h z publicznego API CoinGecko. " +
    "Użyj przy pytaniach o cenę lub kurs kryptowalut (bitcoin, ethereum, solana…). " +
    "Przyjmuje symbol (BTC, ETH), nazwę (Bitcoin) albo identyfikator CoinGecko (bitcoin).",
  inputSchema: z.object({
    kryptowaluta: z
      .string()
      .min(2)
      .max(40)
      .describe("Symbol (BTC), nazwa (Bitcoin) albo identyfikator CoinGecko (bitcoin)"),
  }),
  execute: async ({ kryptowaluta }) => {
    const pobrano = teraz();
    const zrodlo = "CoinGecko (coingecko.com)";
    const input = kryptowaluta.trim();

    const apiKey = process.env.COINGECKO_DEMO_API_KEY;
    const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {};

    // Próbujemy po kolei: identyfikator -> symbol -> nazwa.
    const proby: [string, string][] = [
      ["ids", input.toLowerCase().replace(/\s+/g, "-")],
      ["symbols", input.toLowerCase()],
      ["names", input],
    ];

    for (const [param, value] of proby) {
      const params = new URLSearchParams({
        [param]: value,
        vs_currencies: "pln,usd",
        include_24hr_change: "true",
        include_last_updated_at: "true",
      });
      const res = await getJson(`${COINGECKO}?${params}`, headers);

      if (!res.ok) {
        return {
          blad:
            res.status === 429
              ? "CoinGecko: przekroczony limit zapytań. Spróbuj za minutę."
              : "Serwis CoinGecko nie odpowiada. Spróbuj za chwilę.",
          pobrano,
        };
      }

      const entries = Object.entries(res.data ?? {}) as [string, any][];
      const [id, d] = entries[0] ?? [];
      if (id && d && typeof d.pln === "number") {
        return {
          kryptowaluta: id,
          cenaPLN: zaokr(d.pln, 2),
          cenaUSD: zaokr(d.usd, 2),
          zmiana24hProc: zaokr(d.pln_24h_change, 2),
          aktualizacja:
            typeof d.last_updated_at === "number"
              ? new Date(d.last_updated_at * 1000).toLocaleString("pl-PL", { timeZone: TIMEZONE })
              : null,
          zrodlo,
          pobrano,
        };
      }
    }

    return {
      blad: `CoinGecko nie zna kryptowaluty „${kryptowaluta}”. Podaj symbol (np. BTC) albo nazwę (np. Ethereum).`,
      pobrano,
    };
  },
});

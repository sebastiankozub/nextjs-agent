import { tool } from "ai";
import { z } from "zod";
import { getJson, teraz } from "./http";

// Wikipedia (polska).
// Dokumentacja: https://pl.wikipedia.org/api/rest_v1/ – /page/summary/{tytuł} → { type, title, extract,
// content_urls.desktop.page }; wyszukiwanie: /w/api.php?action=query&list=search&srsearch=…
// Wikimedia wymaga identyfikującego nagłówka User-Agent.

const WIKI_HEADERS = {
  "user-agent": "StudioNovaChatbot/1.0 (https://nextjs-agent-five.vercel.app; kurs LABA)",
  "api-user-agent": "StudioNovaChatbot/1.0 (https://nextjs-agent-five.vercel.app; kurs LABA)",
};

function skrocTekst(text: string, max = 700): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const kropka = cut.lastIndexOf(". ");
  return (kropka > max * 0.5 ? cut.slice(0, kropka + 1) : cut) + " …";
}

export const wikipedia = tool({
  description:
    "Krótkie streszczenie hasła z polskiej Wikipedii z linkiem do artykułu. " +
    "Użyj przy pytaniach „co to jest…”, „kim był…”, „opowiedz o…” (miasta, osoby, pojęcia, historia). " +
    "Do aktualnych wiadomości i cen używaj wyszukajWInternecie.",
  inputSchema: z.object({
    haslo: z.string().min(1).max(120).describe("Hasło do wyszukania, np. „Lizbona”"),
  }),
  execute: async ({ haslo }) => {
    const pobrano = teraz();
    const zrodlo = "Wikipedia, wolna encyklopedia (pl.wikipedia.org), licencja CC BY-SA";
    const NIE_ODPOWIADA = "Wikipedia nie odpowiada. Spróbuj za chwilę.";

    const summary = (title: string) =>
      getJson(
        `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/ /g, "_"))}`,
        WIKI_HEADERS,
      );

    let res = await summary(haslo);
    if (!res.ok && res.status === 404) {
      // Brak dokładnego tytułu – szukamy najlepszego dopasowania.
      const params = new URLSearchParams({
        action: "query", list: "search", srsearch: haslo, srlimit: "1", format: "json", origin: "*",
      });
      const search = await getJson(`https://pl.wikipedia.org/w/api.php?${params}`, WIKI_HEADERS);
      if (!search.ok) return { blad: NIE_ODPOWIADA, pobrano };
      const title = search.data?.query?.search?.[0]?.title;
      if (!title) return { blad: `Nie znalazłem w polskiej Wikipedii hasła „${haslo}”.`, pobrano };
      res = await summary(title);
    }
    if (!res.ok || !res.data) return { blad: NIE_ODPOWIADA, pobrano };

    const d = res.data;
    return {
      tytul: d.title,
      streszczenie: skrocTekst(String(d.extract ?? "")),
      link: d.content_urls?.desktop?.page ?? `https://pl.wikipedia.org/wiki/${encodeURIComponent(d.title)}`,
      ...(d.type === "disambiguation"
        ? { uwaga: "To strona ujednoznaczniająca – hasło ma kilka znaczeń. Doprecyzuj, o które chodzi." }
        : {}),
      zrodlo,
      pobrano,
    };
  },
});

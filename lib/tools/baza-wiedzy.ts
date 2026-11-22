import { tool } from "ai";
import { z } from "zod";
import { KNOWLEDGE_MIN_SIMILARITY, searchKnowledge as searchKnowledgeInDb } from "../knowledge";

// Wyszukiwanie po znaczeniu w tabeli chunks (Supabase pgvector, funkcja match_chunks).
// Narzędzie działa tylko w /api/agent, który najpierw sprawdza sesję.
export const searchKnowledge = tool({
  description:
    "Wyszukuje w bazie wiedzy firmy (dokumenty wklejone na /upload: cenniki, FAQ, regulaminy). " +
    "Używaj przy każdym pytaniu o firmę, ofertę, ceny, zasady i regulamin. " +
    "Zwraca do 3 najlepiej pasujących fragmentów: tytuł dokumentu, treść fragmentu i podobieństwo (0–1). " +
    "Fragmenty o zbyt niskim podobieństwie są pomijane – pusta lista znaczy, że w bazie nie ma nic na ten temat.",
  inputSchema: z.object({
    pytanie: z
      .string()
      .min(2)
      .max(500)
      .describe("Pytanie użytkownika – najlepiej pełnym zdaniem, z nazwą firmy lub pakietu, jeśli padła"),
  }),
  execute: async ({ pytanie }) => {
    const result = await searchKnowledgeInDb(pytanie, 3);
    if (!result.ok) return { blad: result.error };
    if (result.value.length === 0) {
      return { fragmenty: [], uwaga: "Baza wiedzy jest pusta – nie ma w niej żadnych fragmentów." };
    }
    // Próg w jednym miejscu: KNOWLEDGE_MIN_SIMILARITY w lib/knowledge.ts.
    const pasujace = result.value.filter((m) => m.similarity >= KNOWLEDGE_MIN_SIMILARITY);
    const pominieto = result.value.length - pasujace.length;
    if (pasujace.length === 0) {
      return {
        fragmenty: [],
        pominieto,
        uwaga: "Żaden fragment nie jest wystarczająco podobny do pytania – w bazie wiedzy nie ma tej informacji.",
      };
    }
    return {
      // id – do pokazania dokładnego fragmentu pod odpowiedzią (lista źródeł w czacie).
      fragmenty: pasujace.map((m) => ({ id: m.id, tytul: m.title, tresc: m.content, podobienstwo: m.similarity })),
      ...(pominieto > 0 ? { pominieto } : {}),
    };
  },
});

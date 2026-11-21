// Próby do doboru progu podobieństwa bazy wiedzy (lekcja 6, W3 Standard).
// Uruchom w folderze projektu:  node --env-file=.env.local scripts/proba-podobienstwa.mjs
// Własny próg do porównania:    node --env-file=.env.local scripts/proba-podobienstwa.mjs 0.55
// Skrypt NIE wypisuje kluczy – tylko pytania, podobieństwa i początki fragmentów.
// Próg używany przez aplikację: KNOWLEDGE_MIN_SIMILARITY w lib/knowledge.ts.
import { createClient } from "@supabase/supabase-js";
import { embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const threshold = Number(process.argv[2] ?? 0.5);

// TAK = odpowiedź jest w dokumentach, CZĘŚĆ = częściowo, NIE = poza bazą.
const questions = [
  ["TAK", "Ile kosztuje pakiet Start w firmie Kwantowy Borsuk?"],
  ["TAK", "Jak szybko mój agent zacznie działać?"],
  ["TAK", "Czy jest okres próbny?"],
  ["TAK", "Czy płacąc za rok z góry zapłacę mniej?"],
  ["TAK", "Gdzie trzymacie dane rozmów?"],
  ["CZĘŚĆ", "Ile kosztuje pakiet Start brutto?"],
  ["CZĘŚĆ", "Ile kosztuje pakiet Firma?"],
  ["NIE", "Jaki jest numer telefonu do działu sprzedaży?"],
  ["NIE", "Czy macie biuro w Gdańsku?"],
  ["NIE", "Jaka będzie jutro pogoda w Krakowie?"],
  ["NIE", "Jak upiec sernik?"],
];

const missing = ["OPENROUTER_API_KEY", "OPENROUTER_EMBEDDING_MODEL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"].filter(
  (name) => !process.env[name],
);
if (missing.length) {
  console.error(`Brak zmiennych: ${missing.join(", ")}. Uruchom z --env-file=.env.local w folderze projektu.`);
  process.exit(1);
}

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const { embeddings } = await embedMany({
  model: openrouter.textEmbeddingModel(process.env.OPENROUTER_EMBEDDING_MODEL),
  values: questions.map(([, q]) => q),
});
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Próg do porównania: ${threshold}  (✓ = fragment liczyłby się jako źródło)\n`);
for (let i = 0; i < questions.length; i++) {
  const [kind, question] = questions[i];
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: JSON.stringify(embeddings[i]),
    match_count: 3,
  });
  if (error) {
    console.error(`Błąd match_chunks: ${error.message}`);
    process.exit(1);
  }
  console.log(`[${kind}] ${question}`);
  for (const row of data ?? []) {
    const sim = row.similarity ?? 0;
    const mark = sim >= threshold ? "✓" : "·";
    console.log(`   ${mark} ${sim.toFixed(3)}  ${row.title}: ${row.content.slice(0, 60).replace(/\s+/g, " ")}…`);
  }
}
console.log("\nDobry próg: pytania TAK mają ✓ przy właściwym fragmencie, pytania NIE nie mają żadnego ✓.");

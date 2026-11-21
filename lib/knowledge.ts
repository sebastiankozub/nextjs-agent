// Baza wiedzy (lekcja 6) – zapis dokumentów i dzielenie na fragmenty. Tylko serwer.
// Każdy fragment dostaje embedding (model z OPENROUTER_EMBEDDING_MODEL) – ten sam model co dla pytań.
import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embedMany } from "ai";
import { describeProviderError, getEmbeddingConfig } from "./openrouter-config";
import { DB_NOT_CONFIGURED, getSupabase } from "./supabase";

export const MAX_TITLE = 200;
export const MAX_CONTENT = 20_000;
/** Akapit dłuższy niż tyle znaków dzielimy na granicy zdania. */
export const MAX_CHUNK = 800;
/** Długość embeddingu = chunks.embedding vector(1536) w Supabase. */
export const EMBEDDING_DIMENSIONS = 1536;
/** Ile starszych fragmentów bez embeddingu uzupełniamy przy jednym imporcie. */
const MAX_BACKFILL = 500;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Ujednolica końce linii (Windows wkleja \r\n). */
export const normalizeText = (text: string) => text.replace(/\r\n?/g, "\n");

/**
 * Jeden akapit (tekst oddzielony pustą linią) = jeden fragment. Krótkich akapitów NIE łączymy.
 * Akapit dłuższy niż MAX_CHUNK dzielimy na granicy zdania (zdania doklejane, dopóki mieszczą się w limicie).
 */
export function splitIntoChunks(text: string): string[] {
  const paragraphs = normalizeText(text)
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.flatMap((p) => (p.length <= MAX_CHUNK ? [p] : splitLongParagraph(p)));
}

function splitLongParagraph(paragraph: string): string[] {
  // Zdanie = tekst do . ! ? lub … (z ewentualnym cudzysłowem/nawiasem zamykającym) albo reszta akapitu.
  const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+["'”»)\]]*|$)\s*/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length <= MAX_CHUNK) {
      current = joined;
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= MAX_CHUNK) {
      current = sentence;
    } else {
      // Pojedyncze zdanie dłuższe niż limit (rzadkie) – tniemy na ostatniej spacji przed limitem.
      const pieces = hardSplit(sentence);
      current = pieces.pop() ?? "";
      chunks.push(...pieces);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function hardSplit(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    const space = rest.lastIndexOf(" ", MAX_CHUNK);
    const cut = space > MAX_CHUNK / 2 ? space : MAX_CHUNK;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// --- Sposób dzielenia: „akapity” (domyślnie) albo „stałe kawałki” ---

export type ChunkMethod = "paragraphs" | "fixed";
export type FixedChunkConfig = { size: number; overlap: number };

const DEFAULT_FIXED: FixedChunkConfig = { size: 300, overlap: 50 };

/**
 * Parametry „stałych kawałków” z .env.local: CHUNK_FIXED_SIZE (długość w znakach) i CHUNK_FIXED_OVERLAP
 * (zakładka – ile znaków końca kawałka powtarza się na początku następnego). Brak albo zła wartość → 300 / 50.
 */
export function getFixedChunkConfig(): FixedChunkConfig {
  const size = Number(process.env.CHUNK_FIXED_SIZE ?? DEFAULT_FIXED.size);
  const overlap = Number(process.env.CHUNK_FIXED_OVERLAP ?? DEFAULT_FIXED.overlap);
  const sizeOk = Number.isInteger(size) && size >= 50 && size <= 5000;
  const overlapOk = Number.isInteger(overlap) && overlap >= 0 && overlap < (sizeOk ? size : DEFAULT_FIXED.size);
  if (!sizeOk || !overlapOk) {
    console.warn(
      "[baza wiedzy] CHUNK_FIXED_SIZE musi być liczbą 50–5000, a CHUNK_FIXED_OVERLAP liczbą od 0 do mniejszej niż CHUNK_FIXED_SIZE – używam domyślnych 300 / 50.",
    );
    return DEFAULT_FIXED;
  }
  return { size, overlap };
}

/** „Stałe kawałki”: okno o długości size przesuwane co (size − overlap) znaków, bez patrzenia na akapity i zdania. */
export function splitFixed(text: string, { size, overlap }: FixedChunkConfig): string[] {
  const clean = normalizeText(text).trim();
  const step = size - overlap;
  const chunks: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    const piece = clean.slice(start, start + size).trim();
    if (piece) chunks.push(piece);
    if (start + size >= clean.length) break;
  }
  return chunks;
}

export function splitByMethod(text: string, method: ChunkMethod): string[] {
  return method === "fixed" ? splitFixed(text, getFixedChunkConfig()) : splitIntoChunks(text);
}

/** Sprawdzenie danych z formularza – te same zasady co w przeglądarce. Zwraca komunikat albo null. */
export function validateDocument(title: string, content: string): string | null {
  if (!title.trim()) return "Wpisz tytuł dokumentu.";
  if (!content.trim()) return "Wklej treść dokumentu.";
  if (title.trim().length > MAX_TITLE) return `Tytuł może mieć najwyżej ${MAX_TITLE} znaków.`;
  if (normalizeText(content).length > MAX_CONTENT)
    return `Treść może mieć najwyżej ${MAX_CONTENT.toLocaleString("pl-PL")} znaków.`;
  return null;
}

/** Tytuł w formie zapisu: bez zbędnych spacji. */
export const cleanTitle = (title: string) => title.trim().replace(/\s+/g, " ");
/** Klucz porównania tytułów: „Cennik 2026” = „cennik  2026”. */
export const titleKey = (title: string) => cleanTitle(title).toLocaleLowerCase("pl-PL");

// --- Lista i usuwanie dokumentów ---

export type DocumentInfo = { id: number; title: string; createdAt: string; chunkCount: number };

/** Dokumenty w bazie: tytuł (nazwa źródła), data dodania (wersja), liczba fragmentów. Najnowsze na górze. */
export async function listDocuments(): Promise<Result<DocumentInfo[]>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  const { data, error } = await db
    .from("documents")
    .select("id, title, created_at, chunks(count)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[baza wiedzy: lista dokumentów]", error);
    return { ok: false, error: dbMessage(error, "Nie udało się wczytać listy dokumentów.") };
  }
  return {
    ok: true,
    value: (data ?? []).map((d) => ({
      id: d.id as number,
      title: d.title as string,
      createdAt: d.created_at as string,
      chunkCount: ((d.chunks as { count: number }[] | null)?.[0]?.count) ?? 0,
    })),
  };
}

/** Dokumenty o tym samym tytule (bez względu na wielkość liter i spacje). */
export async function findDocumentsByTitle(title: string): Promise<Result<DocumentInfo[]>> {
  const all = await listDocuments();
  if (!all.ok) return all;
  const key = titleKey(title);
  return { ok: true, value: all.value.filter((d) => titleKey(d.title) === key) };
}

/** Usuwa dokument; fragmenty znikają kaskadowo. value = false, gdy dokumentu już nie było. */
export async function deleteDocument(id: number): Promise<Result<boolean>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  const { data, error } = await db.from("documents").delete().eq("id", id).select("id");
  if (error) {
    console.error("[baza wiedzy: usuwanie dokumentu]", error);
    return { ok: false, error: dbMessage(error, "Nie udało się usunąć dokumentu.") };
  }
  return { ok: true, value: (data ?? []).length > 0 };
}

// --- Import ---

export type ImportStage = "split" | "embed" | "save";
export const STAGE_LABELS: Record<ImportStage, string> = {
  split: "Dzielę tekst…",
  embed: "Tworzę embeddingi…",
  save: "Zapisuję…",
};

export type ImportSuccess = {
  id: number;
  title: string;
  chunkCount: number;
  backfilled: number;
  replaced: number;
  warnings: string[];
};
export type ImportFailure = { ok: false; stage: ImportStage; error: string; hint: string };

/**
 * Import dokumentu w trzech etapach (onStage zgłasza bieżący etap do przeglądarki):
 * 1) split – dzielenie na fragmenty,
 * 2) embed – JEDNO wywołanie embedMany: nowe fragmenty + starsze fragmenty z pustym embeddingiem,
 * 3) save  – dokument w documents, fragmenty z embeddingiem w chunks, uzupełnienie starszych,
 *            a przy zastępowaniu – usunięcie poprzednich wersji o tym samym tytule.
 * Dokument powstaje dopiero na etapie zapisu, więc błąd embeddingów nie zostawia śmieci w bazie.
 * Gdy nie zapiszą się fragmenty – niedokończony dokument jest usuwany. Stara wersja znika
 * dopiero PO udanym zapisie nowej, więc nieudany import niczego nie psuje.
 */
export async function importDocument(
  title: string,
  content: string,
  replaceIds: number[],
  onStage: (stage: ImportStage) => void,
  method: ChunkMethod = "paragraphs",
): Promise<{ ok: true; value: ImportSuccess } | ImportFailure> {
  const db = getSupabase();
  if (!db) return { ok: false, stage: "save", error: DB_NOT_CONFIGURED, hint: HINT_DB };
  const embeddingConfig = getEmbeddingConfig();
  if (!embeddingConfig.ok) return { ok: false, stage: "embed", error: embeddingConfig.message, hint: HINT_EMBED_CONFIG };

  // 1) Dzielenie
  onStage("split");
  const savedTitle = cleanTitle(title);
  const chunks = splitByMethod(content, method);
  if (chunks.length === 0) {
    return { ok: false, stage: "split", error: "W treści nie ma żadnego akapitu.", hint: "Wklej tekst dokumentu – akapity oddziel pustą linią." };
  }

  // 2) Embeddingi
  onStage("embed");
  const { data: pendingRows, error: pendingError } = await db
    .from("chunks")
    .select("id, document_id, content")
    .is("embedding", null)
    .order("id", { ascending: true })
    .limit(MAX_BACKFILL);
  if (pendingError) {
    console.error("[baza wiedzy: odczyt fragmentów bez embeddingu]", pendingError);
    return { ok: false, stage: "embed", error: dbMessage(pendingError, "Nie udało się odczytać bazy wiedzy."), hint: HINT_DB };
  }
  // Fragmenty wersji, która zaraz zostanie zastąpiona, nie potrzebują embeddingów.
  const pending = ((pendingRows ?? []) as { id: number; document_id: number; content: string }[]).filter(
    (p) => !replaceIds.includes(p.document_id),
  );

  let embeddings: number[][];
  try {
    const openrouter = createOpenRouter({ apiKey: embeddingConfig.apiKey });
    const result = await embedMany({
      model: openrouter.textEmbeddingModel(embeddingConfig.modelId),
      values: [...chunks, ...pending.map((p) => p.content)],
    });
    embeddings = result.embeddings;
  } catch (error) {
    console.error("[baza wiedzy: embeddingi]", error);
    const message = describeProviderError(error, "tworzenie embeddingów", embeddingConfig.modelId, "OPENROUTER_EMBEDDING_MODEL");
    return {
      ok: false,
      stage: "embed",
      error: `Nie udało się utworzyć embeddingów. ${message}`,
      hint: /Za dużo zapytań/.test(message) ? "Odczekaj chwilę i kliknij „Dodaj do bazy wiedzy” jeszcze raz." : HINT_EMBED_PROVIDER,
    };
  }
  const badLength = embeddings.find((e) => e.length !== EMBEDDING_DIMENSIONS);
  if (embeddings.length !== chunks.length + pending.length || badLength) {
    return {
      ok: false,
      stage: "embed",
      error: badLength
        ? `Model embeddingów zwrócił listę ${badLength.length} liczb, a baza oczekuje ${EMBEDDING_DIMENSIONS}.`
        : "Model embeddingów zwrócił niepełny wynik.",
      hint: badLength
        ? "Zmień model w OPENROUTER_EMBEDDING_MODEL albo długość kolumny embedding (lekcja 6, warsztat 1, poziom Standard)."
        : "Spróbuj ponownie za chwilę.",
    };
  }

  // 3) Zapis
  onStage("save");
  const { data: doc, error: docError } = await db.from("documents").insert({ title: savedTitle }).select("id").single();
  if (docError || !doc) {
    console.error("[baza wiedzy: zapis dokumentu]", docError);
    return { ok: false, stage: "save", error: dbMessage(docError, "Nie udało się zapisać dokumentu w bazie."), hint: HINT_DB };
  }
  const documentId = doc.id as number;

  // pgvector przyjmuje wektor jako tekst „[0.1,0.2,…]”.
  const rows = chunks.map((text, index) => ({
    document_id: documentId,
    chunk_index: index,
    content: text,
    embedding: JSON.stringify(embeddings[index]),
  }));
  const { error: chunkError } = await db.from("chunks").insert(rows);
  if (chunkError) {
    console.error("[baza wiedzy: zapis fragmentów]", chunkError);
    const { error: cleanupError } = await db.from("documents").delete().eq("id", documentId);
    if (cleanupError) console.error("[baza wiedzy: usuwanie niedokończonego dokumentu]", cleanupError);
    return {
      ok: false,
      stage: "save",
      error: dbMessage(chunkError, "Nie udało się zapisać fragmentów dokumentu."),
      hint: cleanupError
        ? "Niedokończonego dokumentu nie udało się usunąć – usuń go przyciskiem „Usuń” na liście poniżej i spróbuj ponownie."
        : "Nic nie zostało zapisane" + (replaceIds.length ? ", poprzednia wersja została bez zmian" : "") + ". " + HINT_DB,
    };
  }

  const warnings: string[] = [];

  // Uzupełnienie starszych fragmentów – nowy dokument jest już kompletny, więc błąd tutaj go nie cofa.
  const oldEmbeddings = embeddings.slice(chunks.length);
  const updates = await Promise.all(
    pending.map((p, i) => db.from("chunks").update({ embedding: JSON.stringify(oldEmbeddings[i]) }).eq("id", p.id)),
  );
  const failed = updates.filter((u) => u.error);
  failed.forEach((u) => console.error("[baza wiedzy: uzupełnianie embeddingów]", u.error));
  if (failed.length)
    warnings.push(`Nie udało się uzupełnić embeddingów ${failed.length} starszych fragmentów – uzupełnią się przy następnym imporcie.`);

  // Zastąpienie: stara wersja znika dopiero teraz, po udanym zapisie nowej.
  let replaced = 0;
  if (replaceIds.length) {
    const { data: removed, error: removeError } = await db.from("documents").delete().in("id", replaceIds).select("id");
    if (removeError) {
      console.error("[baza wiedzy: usuwanie poprzedniej wersji]", removeError);
      warnings.push("Nowa wersja jest zapisana, ale poprzedniej nie udało się usunąć – usuń ją przyciskiem „Usuń” na liście.");
    } else {
      replaced = (removed ?? []).length;
    }
  }

  return {
    ok: true,
    value: { id: documentId, title: savedTitle, chunkCount: chunks.length, backfilled: pending.length - failed.length, replaced, warnings },
  };
}

const HINT_DB =
  "Sprawdź, czy działa internet i czy w Supabase są tabele documents i chunks (lekcja 6, warsztat 1), potem spróbuj ponownie.";
const HINT_EMBED_CONFIG = "Uzupełnij OPENROUTER_EMBEDDING_MODEL w .env.local i uruchom serwer ponownie.";
const HINT_EMBED_PROVIDER =
  "Sprawdź nazwę modelu w OPENROUTER_EMBEDDING_MODEL i uruchom serwer ponownie. Jeśli to nie pomaga – zgłoś prowadzącemu (klucz lub dostęp do modelu). Nic nie zostało zapisane.";

/** Zrozumiały komunikat po polsku dla typowych błędów Supabase (szczegóły zawsze w terminalu). */
function dbMessage(error: { code?: string; message?: string } | null, fallback: string): string {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (code === "42P01" || /does not exist|schema cache/i.test(msg))
    return `${fallback} Brakuje tabel documents/chunks – uruchom skrypt z warsztatu 1 w Supabase (SQL Editor).`;
  if (code === "42501" || /permission denied/i.test(msg))
    return `${fallback} Brak uprawnień do tabel – w SQL Editor uruchom: grant all on table documents, chunks to service_role;`;
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg))
    return `${fallback} Brak połączenia z Supabase – sprawdź internet i SUPABASE_URL.`;
  return `${fallback} Szczegóły błędu są w terminalu serwera.`;
}

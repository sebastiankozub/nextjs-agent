// Zapis i odczyt rozmów (tabele conversations i messages). Tylko serwer.
// Sesję sprawdza wywołujący (endpoint albo strona) – zanim zawoła te funkcje.
import "server-only";
import type { UIMessage } from "ai";
import { DB_NOT_CONFIGURED, getSupabase } from "./supabase";

export const IMAGE_MARK = "[obraz]";
const TITLE_MAX = 60;
const LOAD_LIMIT = 200;

export type StoredMessage = { id: number; role: "user" | "assistant"; content: string };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(where: string, error: unknown): { ok: false; error: string } {
  console.error(`[baza ${where}]`, error);
  return { ok: false, error: "Nie udało się połączyć z bazą Supabase. Szczegóły błędu są w terminalu serwera." };
}

/** Tekst wiadomości do zapisu: same części tekstowe, a zamiast każdego zdjęcia/obrazu dopisek „[obraz]”. */
export function messageTextForDb(message: UIMessage): string {
  const pieces: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text" && part.text.trim()) pieces.push(part.text.trim());
    else if (part.type === "file") pieces.push(IMAGE_MARK);
  }
  return pieces.join("\n");
}

/** Numer rozmowy z przeglądarki: tylko dodatnia liczba całkowita, inaczej null. */
export function parseConversationId(value: unknown): number | null {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Rozmowa do zapisu: istniejąca (gdy przeglądarka podała numer i taki jest w bazie)
 * albo nowa – pierwsza wiadomość tworzy rozmowę, a jej początek staje się tytułem.
 */
export async function ensureConversation(
  requestedId: number | null,
  firstText: string,
): Promise<Result<number> & { created?: boolean }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  try {
    if (requestedId !== null) {
      const { data, error } = await db.from("conversations").select("id").eq("id", requestedId).maybeSingle();
      if (error) return fail("odczyt rozmowy", error);
      if (data) return { ok: true, value: requestedId };
    }
    const title = firstText.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX) || "Nowa rozmowa";
    const { data, error } = await db.from("conversations").insert({ title }).select("id").single();
    if (error) return fail("nowa rozmowa", error);
    return { ok: true, value: data.id as number, created: true };
  } catch (error) {
    return fail("rozmowa", error);
  }
}

/**
 * Zapis jednej wymiany: wiadomość użytkownika, potem (jeśli jest) odpowiedź agenta.
 * Jedno polecenie insert – obie wiadomości trafiają do bazy razem i w tej kolejności (rosnące id).
 */
export async function saveExchange(
  conversationId: number,
  userText: string,
  assistantText: string | null,
): Promise<Result<null>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  const rows = [{ conversation_id: conversationId, role: "user", content: userText }];
  if (assistantText) rows.push({ conversation_id: conversationId, role: "assistant", content: assistantText });
  try {
    const { error } = await db.from("messages").insert(rows);
    if (error) return fail("zapis wiadomości", error);
    return { ok: true, value: null };
  } catch (error) {
    return fail("zapis wiadomości", error);
  }
}

export type ConversationSummary = { id: number; title: string; createdAt: string; messageCount: number };

/** Lista rozmów do /history: tytuł, data, liczba wiadomości; najnowsze na górze. */
export async function listConversations(limit = 100): Promise<Result<ConversationSummary[]>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  try {
    // messages(count) – Supabase liczy wiadomości po relacji conversation_id → conversations.id.
    const { data, error } = await db
      .from("conversations")
      .select("id, title, created_at, messages(count)")
      .order("id", { ascending: false })
      .limit(limit);
    if (error) return fail("lista rozmów", error);
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.id as number,
        title: String(row.title ?? "").trim() || "Bez tytułu",
        createdAt: String(row.created_at),
        messageCount: Number((row.messages as Array<{ count?: number }> | null)?.[0]?.count ?? 0),
      })),
    };
  } catch (error) {
    return fail("lista rozmów", error);
  }
}

/**
 * Rozmowa z wiadomościami w kolejności zapisu (rosnące id).
 * requestedId = null → najnowsza rozmowa. Wynik null = nie ma takiej rozmowy (albo baza jest pusta).
 */
export async function loadConversation(
  requestedId: number | null,
): Promise<Result<{ id: number; messages: StoredMessage[] } | null>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  try {
    const query = db.from("conversations").select("id");
    const { data: conversation, error } =
      requestedId === null
        ? await query.order("id", { ascending: false }).limit(1).maybeSingle()
        : await query.eq("id", requestedId).maybeSingle();
    if (error) return fail("odczyt rozmowy", error);
    if (!conversation) return { ok: true, value: null };
    const id = conversation.id as number;
    // Najnowsze LOAD_LIMIT wiadomości, potem odwracamy do kolejności od najstarszej.
    const { data: rows, error: messagesError } = await db
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", id)
      .order("id", { ascending: false })
      .limit(LOAD_LIMIT);
    if (messagesError) return fail("wiadomości rozmowy", messagesError);
    const messages = (rows ?? [])
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({ id: row.id as number, role: row.role as StoredMessage["role"], content: String(row.content ?? "") }))
      .reverse();
    return { ok: true, value: { id, messages } };
  } catch (error) {
    return fail("odczyt rozmowy", error);
  }
}

/** Nowy tytuł rozmowy (np. nadany przez model po pierwszej odpowiedzi). */
export async function renameConversation(id: number, title: string): Promise<Result<null>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  try {
    const { error } = await db.from("conversations").update({ title: title.slice(0, TITLE_MAX) }).eq("id", id);
    if (error) return fail("zmiana tytułu", error);
    return { ok: true, value: null };
  } catch (error) {
    return fail("zmiana tytułu", error);
  }
}

/**
 * Usuwa rozmowę. Wiadomości usuwa baza (relacja messages → conversations z ON DELETE CASCADE).
 * Wynik false = takiej rozmowy nie było.
 */
export async function deleteConversation(id: number): Promise<Result<boolean>> {
  const db = getSupabase();
  if (!db) return { ok: false, error: DB_NOT_CONFIGURED };
  try {
    const { data, error } = await db.from("conversations").delete().eq("id", id).select("id");
    if (error) return fail("usuwanie rozmowy", error);
    return { ok: true, value: (data ?? []).length > 0 };
  } catch (error) {
    return fail("usuwanie rozmowy", error);
  }
}

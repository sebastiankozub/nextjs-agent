// Jedyne połączenie z bazą Supabase. Działa wyłącznie na serwerze (import "server-only"):
// klucz secret nigdy nie trafia do przeglądarki.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Klient bazy albo null, gdy w .env.local brakuje SUPABASE_URL lub SUPABASE_SECRET_KEY. */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    // Serwer nie loguje użytkowników przez Supabase – żadnych sesji ani odświeżania tokenów.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export const DB_NOT_CONFIGURED =
  "Baza nie jest podłączona: uzupełnij SUPABASE_URL i SUPABASE_SECRET_KEY w .env.local i uruchom serwer ponownie.";

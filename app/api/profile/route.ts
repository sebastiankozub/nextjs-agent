import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";
import { clearProfile, getProfile, replaceProfile } from "../../../lib/profile";

// Profil użytkownika (lekcja 5, W3): odczyt, zapis poprawek ze strony /profile, wyczyszczenie.
// Każda metoda najpierw sprawdza sesję – bez niej baza nie jest ruszana.

function unauthorized(req: Request) {
  if (isValidSessionToken(readSessionCookie(req), getAuthConfig())) return null;
  return Response.json(
    { error: "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się." },
    { status: 401 },
  );
}

export async function GET(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;
  const result = await getProfile();
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json(result.value);
}

export async function PUT(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe zapytanie." }, { status: 400 });
  }
  const { name, preferences } = (body ?? {}) as { name?: unknown; preferences?: unknown };
  if (name !== null && name !== undefined && typeof name !== "string") {
    return Response.json({ error: "Imię musi być tekstem." }, { status: 400 });
  }
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    return Response.json({ error: "Preferencje muszą być listą par nazwa–wartość." }, { status: 400 });
  }
  const pairs = Object.entries(preferences as Record<string, unknown>);
  if (pairs.some(([, value]) => typeof value !== "string")) {
    return Response.json({ error: "Każda wartość musi być tekstem." }, { status: 400 });
  }
  const result = await replaceProfile({ name: name ?? null, preferences: Object.fromEntries(pairs) as Record<string, string> });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json(result.value);
}

export async function DELETE(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;
  const result = await clearProfile();
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json(result.value);
}

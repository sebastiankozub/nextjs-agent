import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../../lib/auth";
import { deleteConversation, parseConversationId } from "../../../../lib/conversations";

// Usuwanie rozmowy z /history (lekcja 5, W2 – dla szybkich).
// Wiadomości znikają razem z rozmową (ON DELETE CASCADE w bazie).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Najpierw sesja – bez niej baza nie jest ruszana.
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return Response.json(
      { error: "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się." },
      { status: 401 },
    );
  }
  const id = parseConversationId((await params).id);
  if (id === null) return Response.json({ error: "Nieprawidłowy numer rozmowy." }, { status: 400 });

  const result = await deleteConversation(id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  if (!result.value) return Response.json({ error: "Nie ma takiej rozmowy – mogła już zostać usunięta." }, { status: 404 });
  return Response.json({ ok: true });
}

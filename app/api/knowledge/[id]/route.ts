import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../../lib/auth";
import { deleteDocument } from "../../../../lib/knowledge";

// Usuwanie dokumentu z bazy wiedzy (/upload). Fragmenty znikają kaskadowo (ON DELETE CASCADE).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Najpierw sesja – bez niej baza nie jest ruszana.
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return Response.json(
      { error: "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się." },
      { status: 401 },
    );
  }
  const raw = (await params).id;
  const id = /^\d{1,15}$/.test(raw) ? Number(raw) : null;
  if (id === null) return Response.json({ error: "Nieprawidłowy numer dokumentu." }, { status: 400 });

  const result = await deleteDocument(id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  if (!result.value) return Response.json({ error: "Nie ma takiego dokumentu – mógł już zostać usunięty." }, { status: 404 });
  return Response.json({ ok: true });
}

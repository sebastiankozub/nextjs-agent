import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";
import { findDocumentsByTitle, importDocument, listDocuments, validateDocument } from "../../../lib/knowledge";

// Baza wiedzy (lekcja 6, W2): lista dokumentów (GET) i import ze strony /upload (POST).
// Każda metoda najpierw sprawdza sesję – bez niej 401, a baza i model nie są ruszane.

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
  const result = await listDocuments();
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ documents: result.value });
}

/**
 * Import. Błędy danych i konflikt tytułu → zwykły JSON (400 / 409).
 * Sam import → strumień NDJSON (jedna linia JSON na zdarzenie), żeby przeglądarka widziała etapy na bieżąco:
 *   {"type":"stage","stage":"split"|"embed"|"save"}
 *   {"type":"done", ...wynik}  albo  {"type":"error","stage":…,"error":…,"hint":…}
 */
export async function POST(req: Request) {
  const denied = unauthorized(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe zapytanie." }, { status: 400 });
  }
  const { title, content, replace, method } = (body ?? {}) as {
    title?: unknown;
    content?: unknown;
    replace?: unknown;
    method?: unknown;
  };
  // Sposób dzielenia: „fixed” = stałe kawałki; cokolwiek innego (albo brak) = akapity.
  const chunkMethod = method === "fixed" ? "fixed" : "paragraphs";
  if (typeof title !== "string" || typeof content !== "string") {
    return Response.json({ error: "Tytuł i treść muszą być tekstem." }, { status: 400 });
  }
  const invalid = validateDocument(title, content);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  // Ten sam tytuł = nowa wersja tego samego źródła. Bez zgody (replace: true) nic nie zastępujemy.
  const existing = await findDocumentsByTitle(title);
  if (!existing.ok) return Response.json({ error: existing.error, stage: "save" }, { status: 500 });
  if (existing.value.length > 0 && replace !== true) {
    return Response.json(
      { conflict: true, error: "Dokument o tym tytule już jest w bazie.", existing: existing.value },
      { status: 409 },
    );
  }
  const replaceIds = existing.value.map((d) => d.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const result = await importDocument(title, content, replaceIds, (stage) => send({ type: "stage", stage }), chunkMethod);
        if (result.ok) send({ type: "done", ...result.value });
        else send({ type: "error", stage: result.stage, error: result.error, hint: result.hint });
      } catch (error) {
        console.error("[baza wiedzy: import]", error);
        send({ type: "error", stage: "save", error: "Nieoczekiwany błąd serwera.", hint: "Szczegóły są w terminalu serwera. Spróbuj ponownie." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

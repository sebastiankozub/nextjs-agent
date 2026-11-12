// PRZESTARZAŁE – zastąpione przez /api/agent (mode "analyze"). Do usunięcia po testach.
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";
import { analyzeDocumentImage } from "../../../lib/analyze-image-run";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "../../../lib/images";

// Analiza zdjęcia dokumentu -> { header, body } (bez streamingu, z walidacją).
export const maxDuration = 60;

function fail(kind: string, message: string, status: number) {
  return Response.json({ ok: false, kind, message }, { status });
}

export async function POST(req: Request) {
  // 1. Sesja — bez niej model nie jest wywoływany.
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return fail("auth", "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się.", 401);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL;
  if (!apiKey || !modelId) {
    return fail("config", "Brak konfiguracji OPENROUTER_API_KEY lub OPENROUTER_MODEL w .env.local.", 500);
  }

  // 2. Wejście: tylko zdjęcie jako data URL. Inne pola są ignorowane.
  let image: unknown;
  try {
    image = (await req.json())?.image;
  } catch {
    return fail("input", "Nieprawidłowe zapytanie.", 400);
  }
  const match = typeof image === "string" ? /^data:([^;]+);base64,(.+)$/.exec(image) : null;
  if (!match) return fail("input", "Dodaj zdjęcie do analizy.", 400);
  const [, mediaType, base64] = match;
  if (!IMAGE_TYPES.includes(mediaType)) {
    return fail("input", "Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.", 400);
  }
  if (Math.floor((base64.length * 3) / 4) > IMAGE_MAX_BYTES) {
    return fail("input", "Zdjęcie jest za duże (maks. 4 MB).", 400);
  }

  // 3. Dwa kroki: nagłówek -> body.
  const outcome = await analyzeDocumentImage({
    apiKey,
    modelId,
    image: base64,
    mediaType,
    logTag: "api/analyze-image",
  });
  const { status, ...rest } = outcome;
  return Response.json(rest, { status });
}

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { APICallError, generateImage, NoContentGeneratedError } from "ai";
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";

// Generowanie obrazu (Nano Banana 2 przez OpenRouter).
// Model obrazów ma osobną zmienną OPENROUTER_IMAGE_MODEL – czat i Vision używają OPENROUTER_MODEL.
export const maxDuration = 60;

const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const MAX_PROMPT = 500;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    switch (error.statusCode) {
      case 401:
        return "OpenRouter odrzucił klucz API. Sprawdź OPENROUTER_API_KEY w .env.local.";
      case 402:
        return "Brak środków na koncie OpenRouter dla modelu obrazów.";
      case 403:
      case 404:
        return "Model obrazów jest niedostępny dla tego klucza. Sprawdź OPENROUTER_IMAGE_MODEL albo zgłoś to prowadzącemu.";
      case 429:
        return "Za dużo zapytań. Odczekaj chwilę i spróbuj ponownie.";
    }
  }
  if (NoContentGeneratedError.isInstance(error)) {
    return "Model nie zwrócił obrazu. Spróbuj innego opisu.";
  }
  return "Nie udało się wygenerować obrazu. Szczegóły są w terminalu serwera.";
}

export async function POST(req: Request) {
  // 1. Najpierw sesja – bez niej model nie zostanie wywołany.
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return jsonError("Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się.", 401);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonError("Brak konfiguracji: OPENROUTER_API_KEY. Uzupełnij .env.local i uruchom ponownie serwer.", 500);
  }
  const imageModelId = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;

  // 2. Opis obrazu: tekst, 1–500 znaków.
  let prompt: unknown;
  try {
    prompt = (await req.json())?.prompt;
  } catch {
    return jsonError("Nieprawidłowe zapytanie.", 400);
  }
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return jsonError("Wpisz opis obrazu.", 400);
  }
  if (prompt.length > MAX_PROMPT) {
    return jsonError(`Opis jest za długi (maks. ${MAX_PROMPT} znaków).`, 400);
  }

  // 3. Generowanie.
  try {
    const openrouter = createOpenRouter({ apiKey });
    const result = await generateImage({
      model: openrouter.imageModel(imageModelId),
      prompt: prompt.trim(),
    });

    return Response.json({
      image: `data:${result.image.mediaType};base64,${result.image.base64}`,
      // Model z metadanych odpowiedzi (nie wpisany na sztywno w interfejsie).
      modelId: result.calls[0]?.response.modelId ?? null,
    });
  } catch (error) {
    console.error("[api/image]", error);
    return jsonError(describeError(error), 502);
  }
}

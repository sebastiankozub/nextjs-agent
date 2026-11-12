import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { APICallError, generateImage, NoContentGeneratedError } from "ai";

// Wspólne generowanie obrazu: przycisk „Wygeneruj obraz” (/api/image) i narzędzie czatu generujObraz.
// Model obrazów: OPENROUTER_IMAGE_MODEL (czat i Vision używają OPENROUTER_MODEL).

export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";
export const MAX_IMAGE_PROMPT = 500;

export type ImageResult =
  | { ok: true; image: string; mediaType: string; modelId: string | null }
  | { ok: false; error: string; status: number };

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

export async function generateStudioImage(prompt: unknown, logTag: string): Promise<ImageResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Brak konfiguracji: OPENROUTER_API_KEY. Uzupełnij .env.local.", status: 500 };
  }
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return { ok: false, error: "Wpisz opis obrazu.", status: 400 };
  }
  if (prompt.length > MAX_IMAGE_PROMPT) {
    return { ok: false, error: `Opis jest za długi (maks. ${MAX_IMAGE_PROMPT} znaków).`, status: 400 };
  }

  const imageModelId = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  try {
    const openrouter = createOpenRouter({ apiKey });
    const result = await generateImage({
      model: openrouter.imageModel(imageModelId),
      prompt: prompt.trim(),
    });
    return {
      ok: true,
      image: `data:${result.image.mediaType};base64,${result.image.base64}`,
      mediaType: result.image.mediaType,
      // Model z metadanych odpowiedzi (nie wpisany na sztywno w interfejsie).
      modelId: result.calls[0]?.response.modelId ?? null,
    };
  } catch (error) {
    console.error(`[${logTag}]`, error);
    return { ok: false, error: describeError(error), status: 502 };
  }
}

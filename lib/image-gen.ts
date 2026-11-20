import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateImage, NoContentGeneratedError } from "ai";
import { describeProviderError, getOpenRouterConfig } from "./openrouter-config";

// Wspólne generowanie obrazu: przycisk „Wygeneruj obraz” (/api/image) i narzędzie czatu generujObraz.
// Model obrazów: OPENROUTER_IMAGE_MODEL (czat i Vision używają OPENROUTER_MODEL).

export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image";
export const MAX_IMAGE_PROMPT = 500;

export type ImageResult =
  | { ok: true; image: string; mediaType: string; modelId: string | null }
  | { ok: false; error: string; status: number };


export async function generateStudioImage(prompt: unknown, logTag: string): Promise<ImageResult> {
  const config = getOpenRouterConfig();
  if (!config.ok) return { ok: false, error: config.message, status: 500 };
  const { apiKey } = config;
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return { ok: false, error: "Wpisz opis obrazu.", status: 400 };
  }
  if (prompt.length > MAX_IMAGE_PROMPT) {
    return { ok: false, error: `Opis jest za długi (maks. ${MAX_IMAGE_PROMPT} znaków).`, status: 400 };
  }

  const imageModelId = process.env.OPENROUTER_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
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
        if (NoContentGeneratedError.isInstance(error)) {
      return { ok: false, error: "Model nie zwrócił obrazu. Spróbuj innego opisu.", status: 502 };
    }
    return {
      ok: false,
      error: describeProviderError(error, "generowanie obrazu", imageModelId, "OPENROUTER_IMAGE_MODEL"),
      status: 502,
    };
  }
}

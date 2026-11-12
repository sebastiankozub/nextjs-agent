import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";
import { generateStudioImage } from "../../../lib/image-gen";

// Przycisk „Wygeneruj obraz” – szybka droga bez modelu czatu (wspólna funkcja z narzędziem generujObraz).
export const maxDuration = 60;

export async function POST(req: Request) {
  // Najpierw sesja – bez niej model nie zostanie wywołany.
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return Response.json(
      { error: "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się." },
      { status: 401 },
    );
  }
  let prompt: unknown;
  try {
    prompt = (await req.json())?.prompt;
  } catch {
    return Response.json({ error: "Nieprawidłowe zapytanie." }, { status: 400 });
  }
  const result = await generateStudioImage(prompt, "api/image");
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ image: result.image, modelId: result.modelId });
}

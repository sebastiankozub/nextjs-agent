import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";
import { generateStudioImage } from "../../../lib/image-gen";
import { ensureConversation, IMAGE_MARK, parseConversationId, saveExchange } from "../../../lib/conversations";

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
  let conversationId: number | null = null;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    conversationId = parseConversationId(body?.conversationId);
  } catch {
    return Response.json({ error: "Nieprawidłowe zapytanie." }, { status: 400 });
  }
  const result = await generateStudioImage(prompt, "api/image");
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  // Zapis w rozmowie (lekcja 5, W2): opis obrazu i dopisek „[obraz]” – samego obrazu nie zapisujemy.
  // Błąd bazy nie psuje wyniku: obraz i tak trafia do przeglądarki, z ostrzeżeniem.
  const userText = `🎨 ${String(prompt).trim()}`;
  const conversation = await ensureConversation(conversationId, userText);
  const saved = conversation.ok ? await saveExchange(conversation.value, userText, IMAGE_MARK) : conversation;
  return Response.json({
    image: result.image,
    modelId: result.modelId,
    ...(conversation.ok ? { conversationId: conversation.value } : {}),
    ...(saved.ok ? {} : { dbError: saved.error }),
  });
}

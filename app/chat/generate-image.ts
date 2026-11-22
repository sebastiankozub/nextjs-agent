import type { UIMessage } from "ai";

type GeneratedImage = { message: UIMessage; conversationId: number | null; dbError: string | null };

/** „Wygeneruj obraz”: opis → /api/image → wiadomość asystenta z obrazem. Rzuca błąd z polskim komunikatem. */
export async function requestGeneratedImage(prompt: string, conversationId: number | null): Promise<GeneratedImage> {
  const res = await fetch("/api/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, conversationId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.image) throw new Error(data.error || "Nie udało się wygenerować obrazu.");

  const mediaType = /^data:([^;]+);/.exec(data.image)?.[1] ?? "image/png";
  const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "png";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return {
    conversationId: typeof data.conversationId === "number" ? data.conversationId : null,
    dbError: typeof data.dbError === "string" ? data.dbError : null,
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      parts: [{ type: "file", mediaType, url: data.image, filename: `studio-nova-${stamp}.${ext}` }],
      metadata: { generatedImage: true, modelId: data.modelId },
    },
  };
}

/** Wiadomość użytkownika pokazywana w rozmowie przy generowaniu obrazu. */
export function imagePromptMessage(prompt: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: `🎨 ${prompt}` }],
    metadata: { generatedImage: true },
  };
}

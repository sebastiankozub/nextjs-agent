import type { ModelMessage, UIMessage } from "ai";
import { toChatModelMessages } from "../analysis";
import { isValidReplySignature, type getAuthConfig } from "../auth";
import { messageTextForDb, parseConversationId } from "../conversations";
import { validateImages } from "../images";

export type AuthConfig = NonNullable<ReturnType<typeof getAuthConfig>>;

export type ChatRequest = {
  modelMessages: ModelMessage[];
  conversationId: number | null;
  /** Ostatnia wiadomość użytkownika – tekst do bazy i do propozycji kontynuacji. */
  userTextForDb: string;
  lastUserText: string;
};

/** Walidacja body z useChat: { messages: UIMessage[], conversationId: number | null }. */
export function parseChatRequest(
  body: unknown,
  authConfig: AuthConfig,
): { ok: true; value: ChatRequest } | { ok: false; error: string } {
  const input = (body ?? {}) as { messages?: unknown; conversationId?: unknown };
  const messages = input.messages as UIMessage[];
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: "Brak wiadomości do wysłania." };

  const last = messages[messages.length - 1];
  const lastHasContent = last?.parts?.some(
    (p) => (p.type === "text" && p.text.trim() !== "") || p.type === "file",
  );
  if (last?.role !== "user" || !lastHasContent) return { ok: false, error: "Wiadomość nie może być pusta." };

  const imageError = validateImages(messages);
  if (imageError) return { ok: false, error: imageError };

  // Odpowiedzi asystenta z historii przyjmujemy tylko z ważnym podpisem serwera.
  const converted = toChatModelMessages(messages, (text, sig) => isValidReplySignature(text, sig, authConfig));
  if (!converted.ok) return { ok: false, error: converted.error };

  return {
    ok: true,
    value: {
      modelMessages: converted.messages,
      conversationId: parseConversationId(input.conversationId),
      userTextForDb: messageTextForDb(last),
      lastUserText: last.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim(),
    },
  };
}

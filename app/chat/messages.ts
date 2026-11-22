import type { UIMessage } from "ai";

/** Wiadomość z obrazem z przycisku „Wygeneruj obraz” (tylko do wyświetlenia, nie idzie do modelu). */
export function isGeneratedImageMessage(message: UIMessage) {
  return (message.metadata as { generatedImage?: boolean } | undefined)?.generatedImage === true;
}

/** Odpowiedź (tekst po walidacji) już przyszła? */
export function lastHasText(messages: UIMessage[]) {
  const last = messages[messages.length - 1];
  return last?.role === "assistant" && last.parts.some((p) => p.type === "text");
}

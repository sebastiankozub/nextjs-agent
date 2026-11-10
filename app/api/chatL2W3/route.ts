import { createChatHandler } from "../../../lib/chat-handler";
import { STUDIO_NOVA_INSTRUCTIONS } from "../../../lib/instructions";

// Czat W3 – wersja z Lekcji 2 (bez zmian treści instrukcji).
export const maxDuration = 30;

export const POST = createChatHandler({
  instructions: STUDIO_NOVA_INSTRUCTIONS,
  logTag: "api/chatL2W3",
});

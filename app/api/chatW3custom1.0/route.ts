import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import {
  getAuthConfig,
  isValidSessionToken,
  readSessionCookie,
} from "../../../lib/auth";
import {
  buildAnalysisPrompt,
  formatChatReply,
  parseChatRequest,
} from "../../../lib/analysis";
import { runAnalysis } from "../../../lib/analysis-run";
import { CHAT_W3_CUSTOM_1_0_INSTRUCTIONS } from "../../../lib/instructions";

// Czat W3 custom 1.0 — ta sama ścieżka bezpieczeństwa i analizy co /api/analyze:
// 1. sesja, klucz i model tylko na serwerze,
// 2. z historii z przeglądarki tylko wiadomości klienta (bez "assistant", "system" odrzucane),
// 3. znaczniki <<< >>> neutralizowane, wiadomości klienta jako dane,
// 4. structured output + walidacja (runAnalysis),
// 5. odpowiedź składa serwer z wyniku po walidacji (formatChatReply).
// Szkic według zasad A+B: bez obietnic kontaktu, terminów i działań pracownika.
export const maxDuration = 30;

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function streamReply(content: { text: string } | { error: string }) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      if ("error" in content) {
        writer.write({ type: "error", errorText: content.error });
        return;
      }
      const id = "reply";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: content.text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return textError(
      "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się.",
      401,
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL;
  if (!apiKey || !modelId) {
    return textError(
      "Brak konfiguracji OPENROUTER_API_KEY lub OPENROUTER_MODEL w .env.local.",
      500,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return textError("Nieprawidłowe zapytanie.", 400);
  }
  const input = parseChatRequest(body);
  if (!input.ok) {
    return textError(input.message, 400);
  }

  const result = await runAnalysis({
    apiKey,
    modelId,
    instructions: CHAT_W3_CUSTOM_1_0_INSTRUCTIONS,
    prompt: buildAnalysisPrompt(input.current, input.previous),
    logTag: "api/chatW3custom1.0",
  });

  if (!result.ok) {
    const details = result.details?.length ? ` (${result.details.join(" ")})` : "";
    return streamReply({ error: result.message + details });
  }
  return streamReply({ text: formatChatReply(result.analysis) });
}

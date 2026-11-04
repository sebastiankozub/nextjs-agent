import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import {
  getAuthConfig,
  isValidSessionToken,
  readSessionCookie,
} from "../../../lib/auth";

// Maksymalny czas jednej odpowiedzi (sekundy).
export const maxDuration = 30;

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    switch (error.statusCode) {
      case 401:
        return "OpenRouter odrzucił klucz API. Sprawdź OPENROUTER_API_KEY w .env.local.";
      case 402:
        return "Brak środków na koncie OpenRouter dla tego modelu.";
      case 404:
        return "OpenRouter nie zna tego modelu. Sprawdź OPENROUTER_MODEL w .env.local.";
      case 429:
        return "Za dużo zapytań. Odczekaj chwilę i spróbuj ponownie.";
    }
  }
  return "Nie udało się uzyskać odpowiedzi od modelu. Szczegóły są w terminalu serwera.";
}

export async function POST(req: Request) {
  // 1. Najpierw sesja. Bez niej nic dalej się nie wykona (brak wywołania modelu).
  if (!isValidSessionToken(readSessionCookie(req), getAuthConfig())) {
    return textError(
      "Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się.",
      401,
    );
  }

  // Klucz i model czytamy tylko na serwerze, nigdy w przeglądarce.
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL;

  const missing = [
    !apiKey && "OPENROUTER_API_KEY",
    !modelId && "OPENROUTER_MODEL",
  ].filter(Boolean);

  if (missing.length > 0) {
    return textError(
      `Brak konfiguracji: ${missing.join(", ")}. Uzupełnij plik .env.local i uruchom ponownie serwer (npm.cmd run dev).`,
      500,
    );
  }

  let messages: UIMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
  } catch {
    return textError("Nieprawidłowe zapytanie.", 400);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return textError("Brak wiadomości do wysłania.", 400);
  }

  const last = messages[messages.length - 1];
  const lastText = last.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
  if (last.role !== "user" || lastText === "") {
    return textError("Wiadomość nie może być pusta.", 400);
  }

  const openrouter = createOpenRouter({ apiKey });

  // Cała historia rozmowy trafia do modelu, więc pamięta poprzednie wiadomości.
  const result = streamText({
    model: openrouter(modelId!),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error("[api/chat]", error);
        return describeError(error);
      },
    }),
  });
}

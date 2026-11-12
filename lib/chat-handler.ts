import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "./auth";
import { aktualnyCzas, kursKrypto, kursWaluty, pogoda } from "./tools";

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
        if (/image/i.test(error.message)) {
          return "Ten model nie obsługuje zdjęć. Ustaw w OPENROUTER_MODEL model z Vision (np. google/gemini-3.8-flash).";
        }
        return "OpenRouter nie zna tego modelu. Sprawdź OPENROUTER_MODEL w .env.local.";
      case 429:
        return "Za dużo zapytań. Odczekaj chwilę i spróbuj ponownie.";
    }
  }
  return "Nie udało się uzyskać odpowiedzi od modelu. Szczegóły są w terminalu serwera.";
}

// Vision: dozwolone formaty i limit rozmiaru zdjęcia.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function validateImages(messages: UIMessage[]): string | null {
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "file") continue;
      if (message.role !== "user") return "Nieprawidłowe zapytanie.";
      if (!IMAGE_TYPES.includes(part.mediaType)) {
        return "Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.";
      }
      // Przyjmujemy tylko zdjęcia wgrane w przeglądarce (data URL), nie linki z internetu.
      const match = /^data:[^;]+;base64,(.*)$/.exec(part.url);
      if (!match) return "Nieprawidłowy format zdjęcia.";
      const bytes = Math.floor((match[1].length * 3) / 4);
      if (bytes > IMAGE_MAX_BYTES) return "Zdjęcie jest za duże (maks. 4 MB).";
    }
  }
  return null;
}

/**
 * Wspólny handler czatu. Każda wersja czatu (endpoint) podaje tylko swoją
 * instrukcję i nazwę do logów — reszta (sesja, klucz, walidacja, model) jest wspólna.
 */
export function createChatHandler(options: {
  instructions: string;
  logTag: string;
}) {
  return async function POST(req: Request) {
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
    const lastHasImage = last.parts.some((part) => part.type === "file");
    if (last.role !== "user" || (lastText === "" && !lastHasImage)) {
      return textError("Wiadomość nie może być pusta.", 400);
    }

    // Zdjęcia (Vision): sprawdzamy na serwerze typ i rozmiar, niezależnie od przeglądarki.
    const imageError = validateImages(messages);
    if (imageError) {
      return textError(imageError, 400);
    }

    const openrouter = createOpenRouter({ apiKey });

    // Cała historia rozmowy trafia do modelu, więc pamięta poprzednie wiadomości.
    const result = streamText({
      model: openrouter(modelId!),
      // Instrukcja tylko z serwera; wiadomości z przeglądarki nie mogą zawierać roli "system"
      // (allowSystemInMessages domyślnie = false).
      instructions: options.instructions,
      messages: await convertToModelMessages(messages),
      // Narzędzie wyszukiwania z OpenRoutera (wykonuje się po stronie OpenRoutera).
      tools: {
        web_search: openrouter.tools.webSearch({
          maxResults: 3,
          engine: "native",
        }),
        // Nasza funkcja – data i godzina w Polsce.
        aktualnyCzas,
        // Publiczne API: Open-Meteo, NBP i CoinGecko.
        pogoda,
        kursWaluty,
        kursKrypto,
      },
      // Model może wykonać kilka kroków (np. wyszukaj -> odpowiedz).
      stopWhen: isStepCount(5),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        // Źródła z wyszukiwania trafiają do przeglądarki jako części "source-url".
        sendSources: true,
        // Moment pobrania odpowiedzi (czas serwera) – pokazywany jako „pobrano: …”.
        // Metadane odpowiedzi: moment pobrania + model, który NAPRAWDĘ odpowiedział (z odpowiedzi API).
        messageMetadata: ({ part }) => {
          if (part.type === "start") return { fetchedAt: new Date().toISOString() };
          if (part.type === "finish-step") return { modelId: part.response.modelId };
          return undefined;
        },
        onError: (error) => {
          console.error(`[${options.logTag}]`, error);
          return describeError(error);
        },
      }),
    });
  };
}

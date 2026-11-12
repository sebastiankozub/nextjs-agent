import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  createUIMessageStream,
  createUIMessageStreamResponse,
  hasToolCall,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import {
  analysisSchema,
  buildChatReply,
  MAX_CHAT_CONTEXT_MESSAGES,
  MAX_MESSAGE_LENGTH,
  neutralizeDelimiters,
  validateAnalysis,
} from "./analysis";
import {
  getAuthConfig,
  isValidReplySignature,
  isValidSessionToken,
  readSessionCookie,
  signReply,
} from "./auth";
import { validateImages } from "./images";
import { CHAT_AGENT_INSTRUCTIONS } from "./instructions";
import { aktualnyCzas, kursKrypto, kursWaluty, pogoda } from "./tools";

// Czat ujednolicony = narzędzia i streaming z L3 + walidacja i bezpieczeństwo z L2W3.
//
// Na żywo (streaming): kroki, wywołania narzędzi, źródła, metadane.
// Po walidacji: odpowiedź. Model kończy wywołaniem narzędzia „odpowiedz” (schemat Zod
// z analizy wiadomości). Serwer sprawdza wynik wspólnym kodem (validateAnalysis)
// i sam składa tekst (buildChatReply). Wolny tekst modelu NIE trafia do przeglądarki.

const ANSWER_TOOL = "odpowiedz";
const FALLBACK_REPLY =
  "Nie udało się przygotować sprawdzonej odpowiedzi. Spróbuj ponownie albo zadaj pytanie inaczej.";

export function describeError(error: unknown): string {
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

function textError(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

type AuthConfig = NonNullable<ReturnType<typeof getAuthConfig>>;

/**
 * Historia z przeglądarki -> wiadomości dla modelu:
 * - "user": tekst jako dane między <<< >>> (znaczniki neutralizowane) + zdjęcia
 *   (już sprawdzone przez validateImages); ostatnia oznaczona jako aktualna,
 * - "assistant": TYLKO gdy ma poprawny podpis serwera (replySig) – wtedy sam tekst
 *   sprawdzonej odpowiedzi, bez części narzędzi; bez podpisu – pomijana (luka R4 z L2W3),
 * - inna rola: odrzucenie całego zapytania.
 */
function toModelMessages(
  messages: UIMessage[],
  config: AuthConfig,
): { ok: true; messages: ModelMessage[] } | { ok: false; error: string } {
  const out: ModelMessage[] = [];
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");

  if (messages.some((m) => m.role !== "user" && m.role !== "assistant")) {
    return { ok: false, error: "Niedozwolona rola wiadomości." };
  }

  for (let index = 0; index < messages.length; index++) {
    const m = messages[index];
    const text = m.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();

    if (m.role === "assistant") {
      const sig = (m.metadata as { replySig?: unknown } | undefined)?.replySig;
      if (text && isValidReplySignature(text, sig, config)) {
        out.push({ role: "assistant", content: text });
      }
      continue;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, error: `Wiadomość jest za długa (max ${MAX_MESSAGE_LENGTH} znaków).` };
    }
    const label =
      index === lastUserIndex
        ? "AKTUALNA wiadomość użytkownika – odpowiedz tylko na nią (dane)"
        : "Wcześniejsza wiadomość użytkownika – już obsłużona, tylko kontekst (dane)";

    const content: Extract<ModelMessage, { role: "user" }>["content"] = [];
    if (text) {
      content.push({ type: "text", text: `${label}:\n<<<\n${neutralizeDelimiters(text)}\n>>>` });
    }
    for (const p of m.parts) {
      if (p.type !== "file") continue;
      const match = /^data:([^;]+);base64,(.*)$/.exec(p.url);
      if (match) content.push({ type: "image", image: match[2], mediaType: match[1] });
    }
    if (content.length > 0) out.push({ role: "user", content });
  }

  // Ograniczenie kontekstu; zaczynamy zawsze od wiadomości użytkownika.
  let trimmed = out.slice(-MAX_CHAT_CONTEXT_MESSAGES * 2);
  while (trimmed.length > 0 && trimmed[0].role !== "user") trimmed = trimmed.slice(1);
  return { ok: true, messages: trimmed };
}

/** Filtr strumienia: przepuszcza postęp, blokuje wolny tekst i surowe argumenty „odpowiedz”. */
function isHidden(chunk: UIMessageChunk, answerCallIds: Set<string>): boolean {
  switch (chunk.type) {
    case "text-start":
    case "text-delta":
    case "text-end":
    case "reasoning-start":
    case "reasoning-delta":
    case "reasoning-end":
      return true;
  }
  if ("toolCallId" in chunk && typeof chunk.toolCallId === "string") {
    if ("toolName" in chunk && chunk.toolName === ANSWER_TOOL) answerCallIds.add(chunk.toolCallId);
    return answerCallIds.has(chunk.toolCallId);
  }
  return false;
}

export async function POST(req: Request) {
  // 1. Sesja – bez niej model nie jest wywoływany.
  const authConfig = getAuthConfig();
  if (!authConfig || !isValidSessionToken(readSessionCookie(req), authConfig)) {
    return textError("Brak dostępu: sesja wygasła lub nie wpisano hasła. Odśwież stronę i zaloguj się.", 401);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL;
  if (!apiKey || !modelId) {
    return textError("Brak konfiguracji OPENROUTER_API_KEY lub OPENROUTER_MODEL w .env.local.", 500);
  }

  // 2. Wejście.
  let messages: UIMessage[];
  try {
    messages = (await req.json())?.messages;
  } catch {
    return textError("Nieprawidłowe zapytanie.", 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return textError("Brak wiadomości do wysłania.", 400);
  }
  const last = messages[messages.length - 1];
  const lastHasContent = last?.parts?.some(
    (p) => (p.type === "text" && p.text.trim() !== "") || p.type === "file",
  );
  if (last?.role !== "user" || !lastHasContent) {
    return textError("Wiadomość nie może być pusta.", 400);
  }
  const imageError = validateImages(messages);
  if (imageError) return textError(imageError, 400);

  const converted = toModelMessages(messages, authConfig);
  if (!converted.ok) return textError(converted.error, 400);

  const openrouter = createOpenRouter({ apiKey });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let finalReply: string | null = null;

      const result = streamText({
        model: openrouter(modelId),
        instructions: CHAT_AGENT_INSTRUCTIONS,
        messages: converted.messages,
        tools: {
          web_search: openrouter.tools.webSearch({ maxResults: 3, engine: "native" }),
          aktualnyCzas,
          pogoda,
          kursWaluty,
          kursKrypto,
          // Jedyna droga do odpowiedzi: argumenty sprawdza schemat Zod (inputSchema),
          // potem wspólna walidacja serwera i budowanie tekstu.
          [ANSWER_TOOL]: tool({
            description:
              "Zakończ odpowiedź: przekaż wynik w schemacie analizy (category, priority, draft, needs_review). " +
              "draft to pełna treść odpowiedzi dla użytkownika.",
            inputSchema: analysisSchema,
            execute: async (input) => {
              const outcome = validateAnalysis(input);
              if (!outcome.ok) {
                return { status: "odrzucono", powod: outcome.details?.join(" ") ?? outcome.message };
              }
              finalReply = buildChatReply(outcome.analysis);
              return { status: "przyjeto" };
            },
          }),
        },
        // Model musi w każdym kroku wywołać narzędzie – nie ma drogi „zwykłym tekstem”.
        toolChoice: "required",
        stopWhen: [hasToolCall(ANSWER_TOOL), isStepCount(6)],
      });

      const uiStream = toUIMessageStream({
        stream: result.stream,
        sendSources: true,
        sendReasoning: false,
        messageMetadata: ({ part }) => {
          if (part.type === "start") return { fetchedAt: new Date().toISOString() };
          if (part.type === "finish-step") return { modelId: part.response.modelId };
          return undefined;
        },
        onError: (error) => {
          console.error("[api/chat]", error);
          return describeError(error);
        },
      });

      // Postęp na żywo (narzędzia, źródła); tekst i „odpowiedz” – zatrzymane.
      const answerCallIds = new Set<string>();
      let finishChunk: UIMessageChunk | null = null;
      let failed = false;
      const reader = uiStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "finish") {
          finishChunk = value;
          continue;
        }
        if (value.type === "error") failed = true;
        if (!isHidden(value, answerCallIds)) writer.write(value);
      }

      // Odpowiedź PO walidacji – składana przez serwer.
      if (!failed) {
        const id = "answer";
        writer.write({ type: "text-start", id });
        const reply = finalReply ?? FALLBACK_REPLY;
        writer.write({ type: "text-delta", id, delta: reply });
        writer.write({ type: "text-end", id });
        // Podpis serwera – przy następnym zapytaniu potwierdza, że to nasza odpowiedź.
        writer.write({ type: "message-metadata", messageMetadata: { replySig: signReply(reply, authConfig) } });
      }
      writer.write(finishChunk ?? { type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

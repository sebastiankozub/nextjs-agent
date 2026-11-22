import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessageStreamWriter,
} from "ai";
import { INTERRUPTED_NOTE } from "./analysis";
import { signReply } from "./auth";
import { ensureConversation, IMAGE_MARK, saveExchange } from "./conversations";
import { buildLastStepRule, CHAT_AGENT_INSTRUCTIONS } from "./instructions";
import { describeProviderError, getOpenRouterConfig } from "./openrouter-config";
import { buildProfileContext, getProfile } from "./profile";
import { ANSWER_TOOL, emptyAnswer, isPureAnswerStep } from "./chat/answer";
import { deferConversationTitle, type ConversationTitleJob } from "./chat/conversation-title-job";
import { composeFinalReply } from "./chat/final-reply";
import { forwardProgress } from "./chat/progress";
import { parseChatRequest, type AuthConfig, type ChatRequest } from "./chat/request";
import { AgentTask } from "./chat/task";
import { buildChatTools } from "./chat/tools";

export type { ChatStats } from "./chat/task";

// Czat = pętla ReAct z narzędziami (streaming postępu) + walidacja odpowiedzi po stronie serwera.
// Model kończy narzędziem „odpowiedz”; serwer sprawdza wynik (validateAnalysis) i sam składa tekst.
// Wolny tekst modelu NIE trafia do przeglądarki. Części: lib/chat/*.

type Turn = {
  writer: UIMessageStreamWriter;
  request: ChatRequest;
  modelId: string;
  apiKey: string;
  authConfig: AuthConfig;
  title: ConversationTitleJob;
  requestSignal?: AbortSignal;
};

/**
 * Tryb "chat" endpointu /api/agent (sesję sprawdza endpoint).
 * requestSignal – „Stop” w przeglądarce zrywa połączenie → przerywamy model i narzędzia.
 */
export async function handleChat(body: unknown, authConfig: AuthConfig, requestSignal?: AbortSignal) {
  const config = getOpenRouterConfig();
  if (!config.ok) return textError(config.message, 500);
  const request = parseChatRequest(body, authConfig);
  if (!request.ok) return textError(request.error, 400);

  const title = deferConversationTitle();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        await runTurn({ writer, request: request.value, ...config, authConfig, title, requestSignal });
      } finally {
        title.cancel(); // każda droga wyjścia zamyka zadanie tytułu
      }
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/** Jedna tura: rozmowa w bazie → pętla agenta → odpowiedź po walidacji → zapis → statystyki. */
async function runTurn({ writer, request, modelId, apiKey, authConfig, title, requestSignal }: Turn) {
  // Błąd bazy nie blokuje czatu – przeglądarka pokaże ostrzeżenie, że rozmowa nie zostanie zapisana.
  const conversation = await ensureConversation(request.conversationId, request.userTextForDb);
  const persist = async (assistantText: string | null) => {
    if (!conversation.ok) return;
    const saved = await saveExchange(conversation.value, request.userTextForDb, assistantText);
    if (!saved.ok && !task.stoppedByUser) writeMetadata(writer, { dbError: saved.error });
  };

  const instructions = await buildInstructions();
  const task = new AgentTask(requestSignal);
  const answer = emptyAnswer();
  const openrouter = createOpenRouter({ apiKey });

  const result = streamText({
    model: openrouter(modelId),
    instructions,
    messages: request.modelMessages,
    abortSignal: task.abortSignal,
    tools: buildChatTools({ openrouter, modelId, writer, task, answer }),
    // W każdym kroku narzędzie – nie ma drogi „zwykłym tekstem”.
    toolChoice: "required",
    // Gdy trzeba kończyć (kroki, wywołania, czas): zostaje tylko „odpowiedz” + reguła, dlaczego.
    prepareStep: ({ stepNumber }) => {
      task.currentStep = stepNumber + 1;
      const reason = task.limitBeforeStep(stepNumber);
      if (!reason) return undefined;
      task.forcedReason ??= reason;
      return { activeTools: [ANSWER_TOOL], toolChoice: "required", instructions: `${instructions}\n\n${buildLastStepRule(reason)}` };
    },
    // Koniec po kroku z SAMYM „odpowiedz” – „odpowiedz” obok innego narzędzia powstała bez jego wyniku.
    stopWhen: [({ steps }) => isPureAnswerStep(steps.at(-1)), isStepCount(task.limits.maxSteps)],
  });

  const uiStream = toUIMessageStream({
    stream: result.stream,
    sendSources: true,
    sendReasoning: false,
    messageMetadata: ({ part }) =>
      part.type === "start" ? { fetchedAt: new Date().toISOString() }
      : part.type === "finish-step" ? { modelId: part.response.modelId }
      : undefined,
    onError: (error) => {
      if (task.timedOut) return "Przekroczono limit czasu zadania.";
      console.error("[api/agent chat]", error);
      return describeProviderError(error, "czat", modelId);
    },
  });
  const conversationMeta = conversation.ok ? { conversationId: conversation.value } : { dbError: conversation.error };
  const progress = await forwardProgress(uiStream, writer, task, conversationMeta);

  // Po „Stop” przeglądarka już nie słucha – wynik częściowy składa sama (app/chat-panel.tsx).
  if (task.stoppedByUser) return persist(INTERRUPTED_NOTE);

  if (progress.failed) {
    await persist(null); // samo pytanie – po F5 widać, co wysłano
  } else {
    const reply = await composeFinalReply(task, answer, result.steps, request.lastUserText);
    writeText(writer, reply.text);
    const imageMade = task.calls.some((call) => call.toolName === "generujObraz" && call.ok);
    await persist(imageMade ? `${reply.text}\n\n${IMAGE_MARK}` : reply.text);
    if (conversation.ok && conversation.created) {
      title.schedule({ conversationId: conversation.value, userText: request.userTextForDb, reply: reply.text });
    }
    writeMetadata(writer, {
      replySig: signReply(reply.text, authConfig), // potwierdza przy następnym zapytaniu, że to nasza odpowiedź
      ...(reply.continuation ? { continuation: reply.continuation } : {}),
      ...(reply.answered ? { knowledgeSources: answer.knowledgeSources } : {}),
    });
  }
  writeMetadata(writer, { stats: task.stats(progress.stepMs) });
  writer.write(progress.finishChunk ?? { type: "finish" });
}

/** Instrukcja agenta + profil użytkownika jako dane (błąd bazy = bez profilu). */
async function buildInstructions(): Promise<string> {
  const profile = await getProfile();
  return `${CHAT_AGENT_INSTRUCTIONS}\n\n${buildProfileContext(profile.ok ? profile.value : null)}`;
}

function writeText(writer: UIMessageStreamWriter, text: string) {
  const id = "answer";
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

function writeMetadata(writer: UIMessageStreamWriter, messageMetadata: Record<string, unknown>) {
  writer.write({ type: "message-metadata", messageMetadata });
}

function textError(message: string, status: number) {
  return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Composer } from "./chat/composer";
import { imagePromptMessage, requestGeneratedImage } from "./chat/generate-image";
import { MessageList } from "./chat/message-list";
import { isGeneratedImageMessage } from "./chat/messages";
import { useAgentStop, useContinuation } from "./chat/use-agent-controls";
import { useConversation } from "./chat/use-conversation";
import { useImageAttachment } from "./chat/use-image-attachment";

type Props = {
  id: string;
  api: string;
  /** Przycisk „Dodaj zdjęcie” i „Wygeneruj obraz” (tylko czat, który obsługuje Vision). */
  allowImages?: boolean;
  /** Lekcja 5, W2: ostatnia rozmowa wczytana z bazy przez serwer (app/page.tsx). */
  initialConversationId?: number | null;
  initialMessages?: UIMessage[];
  initialDbError?: string | null;
  /** Miejsce w nagłówku (obok zakładek) na „Nowa rozmowa”; null = bez przycisku. */
  headerSlot?: HTMLElement | null;
  /** Imię z profilu – powitanie na starcie nowej rozmowy (lekcja 5, W3). */
  initialUserName?: string | null;
};

// Jeden panel czatu = jeden endpoint i własna historia rozmowy.
export default function ChatPanel({
  id,
  api,
  allowImages = false,
  initialConversationId = null,
  initialMessages = [],
  initialDbError = null,
  headerSlot = null,
  initialUserName = null,
}: Props) {
  const [userName, setUserName] = useState<string | null>(initialUserName);
  const [showGreeting, setShowGreeting] = useState(initialMessages.length === 0);
  const [messageErrors, setMessageErrors] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const attachment = useImageAttachment();

  // Ref: onError i transport są tworzone raz – czytają stąd aktualne wartości.
  const messagesRef = useRef<UIMessage[]>([]);
  const [transport] = useState(() => createTransport(api, () => conversation.conversationIdRef.current));
  const { messages, sendMessage, setMessages, status, clearError, stop } = useChat({
    id,
    messages: initialMessages,
    transport,
    // Błąd czatu dotyczy ostatniej wiadomości użytkownika – pokazujemy go pod nią.
    onError: (err) => {
      const lastUser = messagesRef.current.findLast((m) => m.role === "user");
      if (lastUser) pinError(lastUser.id, err.message || "Coś poszło nie tak. Spróbuj ponownie.");
      clearError();
    },
  });
  messagesRef.current = messages;
  const conversation = useConversation(initialConversationId, initialDbError, messages);
  useContinuation(status, messages, setInput);
  const handleStop = useAgentStop(status, stop, setMessages);

  const agentWorking = status === "submitted" || status === "streaming";
  const busy = agentWorking || generating;

  function pinError(messageId: string, text: string) {
    setMessageErrors((prev) => ({ ...prev, [messageId]: text }));
  }

  function handleSend() {
    const text = input.trim();
    const files = attachment.files();
    // useChat zamienia plik na data URL i wysyła jako część typu "file".
    if (files) sendMessage({ text: text || "Co widzisz na tym zdjęciu?", files });
    else sendMessage({ text });
    setInput("");
    attachment.clearImage();
  }

  async function handleGenerate() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    const userMessage = imagePromptMessage(prompt);
    setGenerating(true);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    try {
      const result = await requestGeneratedImage(prompt, conversation.conversationIdRef.current);
      if (result.conversationId !== null) conversation.rememberConversation(result.conversationId);
      conversation.setDbError(result.dbError);
      setMessages((prev) => [...prev, result.message]);
    } catch (err) {
      pinError(userMessage.id, err instanceof Error ? err.message : "Nie udało się wygenerować obrazu.");
    } finally {
      setGenerating(false);
    }
  }

  // „Nowa rozmowa”: pusty czat; następna wiadomość utworzy nową rozmowę w bazie. Stara zostaje w bazie.
  function startNewConversation() {
    if (busy) return;
    conversation.rememberConversation(null);
    setMessages([]);
    setShowGreeting(true);
    setMessageErrors({});
    setInput("");
    attachment.reset();
    // Imię mogło się zmienić (zapiszProfil albo /profile) – pobieramy aktualne.
    fetchUserName().then((name) => name !== undefined && setUserName(name));
  }

  const greeting = !showGreeting
    ? null
    : userName
      ? `Dzień dobry, ${userName}! W czym mogę dziś pomóc?`
      : "Dzień dobry! Jestem asystentem Studio Nova. Jak mam się do Ciebie zwracać?";

  return (
    <>
      {headerSlot &&
        createPortal(
          <button
            type="button"
            className="secondary new-chat"
            onClick={startNewConversation}
            disabled={busy || messages.length === 0}
            title="Zacznij pustą rozmowę – poprzednia zostaje zapisana w bazie"
          >
            ＋ Nowa rozmowa
          </button>,
          headerSlot,
        )}
      {conversation.dbError && (
        <p className="msg-error" role="alert">
          ⚠️ {conversation.dbError}
        </p>
      )}
      <MessageList
        messages={messages}
        greeting={greeting}
        messageErrors={messageErrors}
        status={status}
        generating={generating}
      />
      <Composer
        input={input}
        setInput={setInput}
        attachment={attachment}
        allowImages={allowImages}
        busy={busy}
        agentWorking={agentWorking}
        onSubmit={handleSend}
        onStop={handleStop}
        onGenerate={handleGenerate}
      />
    </>
  );
}

/**
 * Transport czatu. Wygenerowane obrazy są tylko do wyświetlenia – nie wysyłamy ich modelowi.
 * Serwer z odpowiedzi asystenta bierze tylko podpisany tekst – resztę (obrazy z narzędzi, źródła,
 * wyniki narzędzi) wycinamy, żeby zapytanie nie rosło o kolejne megabajty.
 */
function createTransport(api: string, conversationId: () => number | null) {
  return new DefaultChatTransport({
    api,
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
      body: {
        mode: "chat",
        id,
        trigger,
        messageId,
        conversationId: conversationId(),
        messages: messages
          .filter((m) => !isGeneratedImageMessage(m))
          .map((m) => (m.role === "assistant" ? { ...m, parts: m.parts.filter((p) => p.type === "text") } : m)),
      },
    }),
  });
}

/** Imię z profilu; undefined = nie udało się pobrać (zostawiamy obecne). */
async function fetchUserName(): Promise<string | null | undefined> {
  try {
    const res = await fetch("/api/profile");
    if (!res.ok) return undefined;
    const profile = (await res.json()) as { name?: string | null };
    return profile.name ?? null;
  } catch {
    return undefined;
  }
}

"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState, type FormEvent } from "react";

// Jeden panel czatu = jeden endpoint (wersja czatu) i własna historia rozmowy.
export default function ChatPanel({ id, api }: { id: string; api: string }) {
  const [transport] = useState(() => new DefaultChatTransport({ api }));
  const { messages, sendMessage, status, error } = useChat({ id, transport });
  const [input, setInput] = useState("");

  const busy = status === "submitted" || status === "streaming";
  const canSend = input.trim() !== "" && !busy;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <>
      <p className="hint">Endpoint: {api}</p>

      <section className="messages" aria-label="Rozmowa" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="author">
              {message.role === "user" ? "Ty" : "Chatbot"}
            </span>
            <ToolLabels message={message} />
            {message.parts.map((part, index) =>
              part.type === "text" ? <p key={index}>{part.text}</p> : null,
            )}
            <Sources message={message} />
          </div>
        ))}

        {status === "submitted" && <p className="pending">Chatbot myśli…</p>}

        {error && (
          <p className="error" role="alert">
            {error.message || "Coś poszło nie tak. Spróbuj ponownie."}
          </p>
        )}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          type="text"
          name="message"
          placeholder="Napisz wiadomość…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" disabled={!canSend}>
          {busy ? "Czekaj…" : "Wyślij"}
        </button>
      </form>
    </>
  );
}

// Lista „Źródła” pod odpowiedzią (tylko gdy model użył wyszukiwania).
function Sources({ message }: { message: UIMessage }) {
  const sources = message.parts.filter((part) => part.type === "source-url");
  if (message.role !== "assistant" || sources.length === 0) return null;

  const meta = message.metadata as { fetchedAt?: string } | undefined;
  const fetchedAt = meta?.fetchedAt ? new Date(meta.fetchedAt) : new Date();
  const fetchedLabel = fetchedAt.toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="sources">
      <strong>Źródła</strong>
      <ul>
        {sources.map((part) => (
          <li key={part.sourceId}>
            <a href={part.url} target="_blank" rel="noopener noreferrer">
              {part.title || new URL(part.url).hostname}
            </a>
          </li>
        ))}
      </ul>
      <small>pobrano: {fetchedLabel}</small>
    </div>
  );
}

// Etykiety użytych narzędzi nad odpowiedzią. Brak narzędzi = nic nie pokazujemy.
const TOOL_LABELS: Record<string, string> = {
  web_search: "🔎 wyszukiwanie",
  aktualnyCzas: "🕒 aktualnyCzas",
  pogoda: "🌤️ pogoda",
  kursWaluty: "💱 kursWaluty",
  kursKrypto: "🦎🪙 kursKrypto",
};

function ToolLabels({ message }: { message: UIMessage }) {
  if (message.role !== "assistant") return null;

  const used: string[] = [];
  for (const part of message.parts) {
    let name: string | null = null;
    if (isToolUIPart(part)) name = getToolName(part);
    // Wyszukiwanie OpenRoutera działa po stronie OpenRoutera — śladem są źródła.
    else if (part.type === "source-url") name = "web_search";
    if (name && !used.includes(name)) used.push(name);
  }
  if (used.length === 0) return null;

  return (
    <div className="tool-labels">
      {used.map((name) => (
        <span key={name} className="tool-label">
          {TOOL_LABELS[name] ?? `🛠 ${name}`}
        </span>
      ))}
    </div>
  );
}

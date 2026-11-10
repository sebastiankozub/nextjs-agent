"use client";

import { useChat } from "@ai-sdk/react";
import { useState, type FormEvent } from "react";
import AnalysisPanel from "./analysis";

export default function Chat({ modelId }: { modelId: string | null }) {
  // Domyślnie useChat wysyła całą rozmowę do /api/chat.
  const { messages, sendMessage, status, error } = useChat();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"chat" | "analysis">("chat");

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
    <main className="chat">
      <header className="chat-header">
        <div>
          <h1>Studio Nova</h1>
          {/* Nazwa modelu (bez klucza) z konfiguracji serwera — do porównywania testów. */}
          <p className="model-id">model: {modelId ?? "brak OPENROUTER_MODEL"}</p>
        </div>
        <form action="/api/logout" method="post">
          <button type="submit" className="logout">
            Wyjdź
          </button>
        </form>
      </header>

      <nav className="modes" aria-label="Tryb">
        <button
          type="button"
          className={mode === "chat" ? "active" : ""}
          onClick={() => setMode("chat")}
        >
          Czat
        </button>
        <button
          type="button"
          className={mode === "analysis" ? "active" : ""}
          onClick={() => setMode("analysis")}
        >
          Analiza wiadomości
        </button>
      </nav>

      {mode === "analysis" ? (
        <AnalysisPanel />
      ) : (
        <>

      <section className="messages" aria-label="Rozmowa" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="author">
              {message.role === "user" ? "Ty" : "Chatbot"}
            </span>
            {message.parts.map((part, index) =>
              part.type === "text" ? (
                <p key={index}>{part.text}</p>
              ) : null,
            )}
          </div>
        ))}

        {status === "submitted" && (
          <p className="pending">Chatbot myśli…</p>
        )}

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
      )}
    </main>
  );
}

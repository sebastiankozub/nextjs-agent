"use client";

import { useChat } from "@ai-sdk/react";
import { useState, type FormEvent } from "react";

export default function Chat() {
  // Domyślnie useChat wysyła całą rozmowę do /api/chat.
  const { messages, sendMessage, status, error } = useChat();
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
    <main className="chat">
      <header className="chat-header">
        <h1>Mój chatbot</h1>
        <form action="/api/logout" method="post">
          <button type="submit" className="logout">
            Wyjdź
          </button>
        </form>
      </header>

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
    </main>
  );
}

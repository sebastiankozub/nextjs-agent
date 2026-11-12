"use client";

import { useState } from "react";
import AnalysisPanel from "./analysis";
import ChatPanel from "./chat-panel";

// Wersje czatu. Każda ma własny endpoint; nowe wersje dopisujemy tutaj.
const CHAT_VERSIONS = [
  { id: "chatL2W3", label: "Czat: L3", api: "/api/chatL2W3" },
  {
    id: "chatW3custom1.0",
    label: "Czat: L2W3 no stream",
    api: "/api/chatW3custom1.0",
  },
] as const;

type Mode = (typeof CHAT_VERSIONS)[number]["id"] | "analysis";

export default function Chat({ modelId }: { modelId: string | null }) {
  const [mode, setMode] = useState<Mode>("chatL2W3");

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
        {CHAT_VERSIONS.map((version) => (
          <button
            key={version.id}
            type="button"
            className={mode === version.id ? "active" : ""}
            onClick={() => setMode(version.id)}
          >
            {version.label}
          </button>
        ))}
        <button
          type="button"
          className={mode === "analysis" ? "active" : ""}
          onClick={() => setMode("analysis")}
        >
          Analiza wiadomości
        </button>
      </nav>

      {/* Panele czatu zostają zamontowane (ukryte), żeby rozmowy nie znikały przy przełączaniu. */}
      {CHAT_VERSIONS.map((version) => (
        <div key={version.id} hidden={mode !== version.id}>
          <ChatPanel id={version.id} api={version.api} allowImages={version.id === "chatL2W3"} />
        </div>
      ))}

      {mode === "analysis" && <AnalysisPanel />}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { UIMessage } from "ai";
import AnalysisPanel from "./analysis";
import ChatPanel from "./chat-panel";
import ThemePicker from "./theme-picker";

// Wersje czatu. Każda ma własny endpoint; nowe wersje dopisujemy tutaj.
const CHAT_VERSIONS = [
  // Czat ujednolicony: narzędzia + streaming postępu + odpowiedź po walidacji Zod.
  { id: "chat", label: "Czat", api: "/api/agent" },
] as const;

type Mode = (typeof CHAT_VERSIONS)[number]["id"] | "analysis";

export default function Chat({
  modelId,
  initialConversationId = null,
  initialMessages = [],
  dbError = null,
  userName = null,
}: {
  modelId: string | null;
  initialConversationId?: number | null;
  initialMessages?: UIMessage[];
  dbError?: string | null;
  userName?: string | null;
}) {
  const [mode, setMode] = useState<Mode>("chat");
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);

  return (
    <main className="chat">
      {/* Nagłówek przyklejony u góry razem z zakładkami trybu – nie odjeżdżają przy przewijaniu. */}
      <header className="chat-header">
        <div className="header-row">
          {/* Logo i nazwa w jednej linii; opis niżej na całą szerokość – mniej miejsca w pionie. */}
          <div className="brand brand-compact">
            <span className="brand-mark" aria-hidden="true">✦</span>
            <h1>Studio Nova</h1>
          </div>
          <div className="header-desc">
            <p className="tagline">Asystent obsługi klientów: szkice odpowiedzi, analiza wiadomości i zdjęć, sprawdzanie danych.</p>
            {/* Nazwa modelu (bez klucza) z konfiguracji serwera — do porównywania testów. */}
            <p className="model-id">model: {modelId ?? "brak konfiguracji modelu"}</p>
          </div>
          <div className="header-actions">
            <Link href="/profile" className="nav-link">
            🧠 Profil
          </Link>
          <Link href="/history" className="nav-link">
              🗂 Historia
            </Link>
            <Link href="/upload" className="nav-link">
              📚 Baza wiedzy
            </Link>
            <Link href="/dashboard" className="nav-link">
              ✈ Asystent podróży
            </Link>
            <ThemePicker />
            <form action="/api/logout" method="post">
              <button type="submit" className="logout">
                Wyjdź
              </button>
            </form>
          </div>
        </div>

      <div className="modes-row">
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
      {/* Miejsce na przycisk „Nowa rozmowa” – wstawia go panel czatu (portal), więc nie przewija się z rozmową. */}
      <div className="modes-slot" ref={setHeaderSlot} />
      </div>
      </header>

      {/* Panele czatu zostają zamontowane (ukryte), żeby rozmowy nie znikały przy przełączaniu. */}
      {CHAT_VERSIONS.map((version) => (
        <div key={version.id} hidden={mode !== version.id}>
          <ChatPanel
            id={version.id}
            api={version.api}
            allowImages
            initialConversationId={initialConversationId}
            initialMessages={initialMessages}
            initialDbError={dbError}
            initialUserName={userName}
            headerSlot={mode === version.id ? headerSlot : null}
          />
        </div>
      ))}

      {mode === "analysis" && <AnalysisPanel />}
    </main>
  );
}

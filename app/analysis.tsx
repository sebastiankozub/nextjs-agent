"use client";

import { useState, type FormEvent } from "react";

type Analysis = {
  category: "sales" | "support" | "billing" | "unknown";
  priority: "normal" | "high";
  draft: string;
  needs_review: boolean;
};

type Outcome =
  | { ok: true; analysis: Analysis }
  | { ok: false; kind: string; message: string; details?: string[] };

const CATEGORY_LABELS: Record<Analysis["category"], string> = {
  sales: "sales — oferta i cena",
  support: "support — problem techniczny",
  billing: "billing — płatność lub zwrot",
  unknown: "unknown — brak rozpoznanej sprawy",
};

export default function AnalysisPanel() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [analyzed, setAnalyzed] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setOutcome(null);
    setAnalyzed(message);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      // Sukces tylko wtedy, gdy serwer wprost potwierdził ok: true.
      if (body && typeof body === "object" && "ok" in body) {
        setOutcome(body as Outcome);
      } else {
        setOutcome({
          ok: false,
          kind: "http",
          message: `Nieoczekiwana odpowiedź serwera (HTTP ${res.status}). Brak analizy.`,
        });
      }
    } catch {
      setOutcome({
        ok: false,
        kind: "network",
        message: "Brak połączenia z serwerem. Brak analizy.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="messages" aria-label="Analiza" aria-live="polite">
        <p className="hint">
          Wklej wiadomość klienta. Wynik to tylko szkic — nic nie jest wysyłane.
        </p>

        {analyzed && (
          <div className="message user">
            <span className="author">Wiadomość klienta</span>
            <p>{analyzed}</p>
          </div>
        )}

        {busy && <p className="pending">Analizuję…</p>}

        {outcome?.ok === true && (
          <div className="analysis">
            <dl>
              <dt>Kategoria</dt>
              <dd>{CATEGORY_LABELS[outcome.analysis.category]}</dd>
              <dt>Priorytet</dt>
              <dd className={outcome.analysis.priority === "high" ? "high" : ""}>
                {outcome.analysis.priority === "high" ? "high — pilne" : "normal"}
              </dd>
              <dt>Status sprawdzenia</dt>
              <dd>
                {outcome.analysis.needs_review
                  ? "Wymaga sprawdzenia przez pracownika"
                  : "Bez dodatkowej decyzji (nadal tylko szkic)"}
              </dd>
            </dl>
            <span className="author">Szkic odpowiedzi (niewysłany)</span>
            <p className="draft">{outcome.analysis.draft}</p>
          </div>
        )}

        {outcome?.ok === false && (
          <div className="error" role="alert">
            <p>{outcome.message}</p>
            {outcome.details && (
              <ul>
                {outcome.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <input
          type="text"
          name="client-message"
          placeholder="Wiadomość klienta do analizy…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || input.trim() === ""}>
          {busy ? "Czekaj…" : "Analizuj"}
        </button>
      </form>
    </>
  );
}

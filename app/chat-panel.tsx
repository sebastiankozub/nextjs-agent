"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { markInterrupted } from "../lib/analysis";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";

// Podpowiedzi opisów obrazu w temacie Studio Nova (klik = wstawienie do pola wiadomości).
const IMAGE_PROMPT_HINTS = [
  "Grafika na post: zaproszenie na 45-minutową konsultację online Studio Nova, nowoczesny minimalistyczny styl, granat i biel",
  "Baner na stronę: osoba przy laptopie podczas rozmowy wideo z doradcą, jasne biuro, ciepłe światło, format 16:9",
  "Ikona do newslettera: kalendarz z dymkiem czatu i gwiazdką, płaska grafika wektorowa, dwa kolory, białe tło",
];

// Vision: dozwolone formaty i limit (te same zasady sprawdza serwer).
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const IMAGE_TYPES = IMAGE_ACCEPT.split(",");
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

// Jeden panel czatu = jeden endpoint (wersja czatu) i własna historia rozmowy.
// allowImages – przycisk „Dodaj zdjęcie” (tylko czat, który obsługuje Vision).
export default function ChatPanel({
  id,
  api,
  allowImages = false,
  initialConversationId = null,
  initialMessages = [],
  initialDbError = null,
  headerSlot = null,
}: {
  id: string;
  api: string;
  allowImages?: boolean;
  // Lekcja 5, W2: ostatnia rozmowa wczytana z bazy przez serwer (app/page.tsx).
  initialConversationId?: number | null;
  initialMessages?: UIMessage[];
  initialDbError?: string | null;
  // Miejsce w nagłówku (obok zakładek) na „Nowa rozmowa”; null = przycisku nie pokazujemy (inny tryb).
  headerSlot?: HTMLElement | null;
}) {
  // Numer rozmowy w bazie. null = następna wiadomość zacznie nową rozmowę.
  // Ref, bo czyta go transport (tworzony raz) przy każdym wysłaniu.
  const conversationIdRef = useRef<number | null>(initialConversationId);
  // Numer rozmowy trafia też do adresu (/?rozmowa=…): F5 wczytuje TĘ rozmowę, a nie inną.
  function rememberConversation(conversationId: number | null) {
    conversationIdRef.current = conversationId;
    if (typeof window === "undefined") return;
    const target = conversationId === null ? "/?nowa=1" : `/?rozmowa=${conversationId}`;
    if (window.location.pathname + window.location.search !== target) {
      window.history.replaceState(window.history.state, "", target);
    }
  }
  const [dbError, setDbError] = useState<string | null>(initialDbError);
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api,
        // Wygenerowane obrazy są tylko do wyświetlenia – nie wysyłamy ich modelowi czatu.
        // Serwer z odpowiedzi asystenta bierze tylko podpisany tekst – resztę (obrazy z narzędzi,
        // źródła, wyniki narzędzi) wycinamy, żeby zapytanie nie rosło o kolejne megabajty.
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: {
            mode: "chat",
            id,
            trigger,
            messageId,
            conversationId: conversationIdRef.current,
            messages: messages
              .filter((m) => !isGeneratedImageMessage(m))
              .map((m) =>
                m.role === "assistant"
                  ? { ...m, parts: m.parts.filter((p) => p.type === "text") }
                  : m,
              ),
          },
        }),
      }),
  );
  // Błędy przypięte do konkretnej wiadomości (id wiadomości użytkownika -> treść błędu).
  const [messageErrors, setMessageErrors] = useState<Record<string, string>>({});
  const messagesRef = useRef<UIMessage[]>([]);
  const { messages, sendMessage, setMessages, status, clearError, stop } = useChat({
    id,
    messages: initialMessages,
    transport,
    onError: (err) => {
      // Błąd czatu dotyczy ostatniej wiadomości użytkownika – pokazujemy go pod nią, nie na dole.
      const lastUser = [...messagesRef.current].reverse().find((m) => m.role === "user");
      const text = err.message || "Coś poszło nie tak. Spróbuj ponownie.";
      if (lastUser) setMessageErrors((prev) => ({ ...prev, [lastUser.id]: text }));
      clearError();
    },
  });
  messagesRef.current = messages;

  // Serwer podaje numer rozmowy (i ewentualny błąd bazy) w metadanych odpowiedzi agenta.
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const meta = messages[i].metadata as { conversationId?: unknown; dbError?: unknown } | undefined;
      if (typeof meta?.dbError === "string") {
        setDbError(meta.dbError);
        return;
      }
      if (typeof meta?.conversationId === "number") {
        rememberConversation(meta.conversationId);
        setDbError(null);
        return;
      }
    }
  }, [messages]);
  const [generating, setGenerating] = useState(false);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Agent nie zdążył wszystkiego (limit kroków): serwer podsyła propozycję następnej wiadomości.
  // Wpisujemy ją w pole wiadomości (tylko gdy jest puste) – użytkownik sam decyduje, czy ją wysłać.
  const appliedContinuation = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || appliedContinuation.current === last.id) return;
    const continuation = (last.metadata as { continuation?: unknown } | undefined)?.continuation;
    if (typeof continuation !== "string" || !continuation.trim()) return;
    appliedContinuation.current = last.id;
    setInput((current) => (current.trim() ? current : continuation));
  }, [status, messages]);

  // „Stop”: przerywa zadanie agenta. Po zatrzymaniu (status wraca do "ready") dopisujemy do rozmowy
  // to, co agent zdążył zrobić, i „Przerwane przez użytkownika”.
  const agentWorking = status === "submitted" || status === "streaming";
  const stopRequested = useRef(false);
  function handleStop() {
    stopRequested.current = true;
    stop();
  }
  useEffect(() => {
    if (status === "submitted" || status === "streaming" || !stopRequested.current) return;
    stopRequested.current = false;
    setMessages((current) => markInterrupted(current));
  }, [status, setMessages]);

  const busy = status === "submitted" || status === "streaming" || generating;
  const canSend = (input.trim() !== "" || image !== null) && !busy;
  const canGenerate = input.trim() !== "" && input.length <= 500 && !image && !busy;

  // „Wygeneruj obraz”: wpisany tekst -> /api/image -> obraz w rozmowie.
  async function handleGenerate() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setGenerating(true);
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: `🎨 ${prompt}` }],
      metadata: { generatedImage: true },
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, conversationId: conversationIdRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.image) {
        throw new Error(data.error || "Nie udało się wygenerować obrazu.");
      }
      if (typeof data.conversationId === "number") rememberConversation(data.conversationId);
      setDbError(typeof data.dbError === "string" ? data.dbError : null);
      const mediaType = /^data:([^;]+);/.exec(data.image)?.[1] ?? "image/png";
      const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "png";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          parts: [
            {
              type: "file",
              mediaType,
              url: data.image,
              filename: `studio-nova-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`,
            },
          ],
          metadata: { generatedImage: true, modelId: data.modelId },
        },
      ]);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Nie udało się wygenerować obrazu.";
      setMessageErrors((prev) => ({ ...prev, [userMessage.id]: text }));
    } finally {
      setGenerating(false);
    }
  }

  // „Nowa rozmowa”: pusty czat; następna wiadomość utworzy nową rozmowę w bazie. Stara zostaje w bazie.
  function startNewConversation() {
    if (busy) return;
    rememberConversation(null);
    setMessages([]);
    setMessageErrors({});
    setInput("");
    clearImage();
    setImageError(null);
  }

  function clearImage() {
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImageError(null);
    if (!file) return clearImage();
    // Sprawdzenie od razu w przeglądarce – zły plik nie leci na serwer.
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.");
      return clearImage();
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError("Zdjęcie jest za duże (maks. 4 MB).");
      return clearImage();
    }
    setImage(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if ((!text && !image) || busy) return;

    if (image && fileInputRef.current?.files) {
      // useChat zamienia plik na data URL i wysyła jako część typu "file".
      sendMessage({ text: text || "Co widzisz na tym zdjęciu?", files: fileInputRef.current.files });
    } else {
      sendMessage({ text });
    }
    setInput("");
    clearImage();
  }

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
      {dbError && (
        <p className="msg-error" role="alert">
          ⚠️ {dbError}
        </p>
      )}
      <section className="messages" aria-label="Rozmowa" aria-live="polite">
        {messages.map((message, index) => (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="author">
              {message.role === "user" ? "Ty" : "Chatbot"}
            </span>
            <ToolLabels message={message} previous={messages[index - 1]} />
            {message.parts.map((part, i) => {
              if (part.type === "text") return <p key={i}>{part.text}</p>;
              // Wynik narzędzia generujObraz (obraz w czacie, model dostał tylko krótki tekst).
              if (part.type === "tool-generujObraz") {
                if (part.state === "input-streaming" || part.state === "input-available") {
                  return <p key={i} className="pending">Generuję obraz…</p>;
                }
                if (part.state === "output-error") {
                  return <p key={i} className="error">Nie udało się wygenerować obrazu.</p>;
                }
                if (part.state === "output-available") {
                  const out = part.output as { image?: string; modelId?: string | null; blad?: string };
                  if (out.blad || !out.image) {
                    return <p key={i} className="error">{out.blad ?? "Nie udało się wygenerować obrazu."}</p>;
                  }
                  const mediaType = /^data:([^;]+);/.exec(out.image)?.[1] ?? "image/png";
                  const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
                  return (
                    <div key={i}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="generated" src={out.image} alt="Wygenerowany obraz" />
                      <a className="download" href={out.image} download={`studio-nova-obraz.${ext}`}>
                        Pobierz
                      </a>
                      {out.modelId && <small className="model-used">model obrazu: {out.modelId}</small>}
                    </div>
                  );
                }
                return null;
              }
              if (part.type === "file" && part.mediaType.startsWith("image/")) {
                const generated = isGeneratedImageMessage(message);
                return (
                  <div key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={generated ? "generated" : "thumb"}
                      src={part.url}
                      alt={part.filename ?? "Wysłane zdjęcie"}
                    />
                    {generated && (
                      <a className="download" href={part.url} download={part.filename ?? "obraz.png"}>
                        Pobierz
                      </a>
                    )}
                  </div>
                );
              }
              return null;
            })}
            <Sources message={message} />
            <ModelUsed message={message} previous={messages[index - 1]} />
            <AnswerStats message={message} />
            {messageErrors[message.id] && (
              <p className="msg-error" role="alert">
                ⚠️ {messageErrors[message.id]}
              </p>
            )}
          </div>
        ))}

        {status === "submitted" && <p className="pending typing">Agent pisze</p>}
        {status === "streaming" && !lastHasText(messages) && (
          <p className="pending typing">Agent pracuje</p>
        )}
        {generating && <p className="pending typing">Generuję obraz</p>}
      </section>

      <div className="composer-bar">
      {allowImages && (image || imageError) && (
        <p className={imageError ? "msg-error" : "hint"} role={imageError ? "alert" : undefined}>
          {imageError ?? (
            <>
              📎 {image!.name}{" "}
              <button type="button" className="link" onClick={clearImage} disabled={busy}>
                usuń
              </button>
            </>
          )}
        </p>
      )}

      <form className="composer" onSubmit={handleSubmit}>
        {allowImages && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              onChange={handleFileChange}
              hidden
            />
            <button
              type="button"
              className="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              Dodaj zdjęcie
            </button>
          </>
        )}
        <input
          type="text"
          name="message"
          placeholder={image ? "Zapytaj o zdjęcie…" : "Napisz wiadomość…"}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        {agentWorking ? (
          <button type="button" className="stop" onClick={handleStop} title="Przerwij pracę agenta">
            ■ Stop
          </button>
        ) : (
          <button type="submit" disabled={!canSend}>
            {busy ? "Czekaj…" : "Wyślij"}
          </button>
        )}
        {allowImages && (
          <button
            type="button"
            className="secondary"
            onClick={handleGenerate}
            disabled={!canGenerate}
            title="Wpisany tekst zostanie użyty jako opis obrazu (maks. 500 znaków)"
          >
            Wygeneruj obraz
          </button>
        )}
      </form>

      {allowImages && (
        <div className="image-hints" aria-label="Podpowiedzi opisów obrazu">
          <span>Pomysły na obraz:</span>
          {IMAGE_PROMPT_HINTS.map((hint) => (
            // Po najechaniu / fokusie chip rozwija się ku górze i pokazuje cały prompt.
            <button
              key={hint}
              type="button"
              className="hint-chip"
              onClick={() => setInput(hint)}
              disabled={busy}
              aria-label={`Wstaw opis obrazu: ${hint}`}
            >
              <span className="chip-short">{hint.split(":")[0]}</span>
              <span className="chip-full" aria-hidden="true">
                <strong>{hint.split(":")[0]}:</strong>
                {hint.slice(hint.indexOf(":") + 1)}
              </span>
            </button>
          ))}
        </div>
      )}
      </div>
    </>
  );
}

// Pod odpowiedzią o zdjęciu: identyfikator modelu z odpowiedzi API (nie z konfiguracji).
function isGeneratedImageMessage(message: UIMessage) {
  return (message.metadata as { generatedImage?: boolean } | undefined)?.generatedImage === true;
}

// Pod odpowiedzią o zdjęciu i pod wygenerowanym obrazem: model z odpowiedzi API.
function ModelUsed({ message, previous }: { message: UIMessage; previous?: UIMessage }) {
  if (message.role !== "assistant") return null;
  const aboutImage =
    isGeneratedImageMessage(message) ||
    (previous?.role === "user" && previous.parts.some((part) => part.type === "file"));
  if (!aboutImage) return null;
  const modelId = (message.metadata as { modelId?: string } | undefined)?.modelId;
  if (!modelId) return null;
  return <small className="model-used">model: {modelId}</small>;
}

// Statystyki pod odpowiedzią (serwer: metadane „stats”): kroki, wywołania narzędzi, czasy.
type AnswerStatsData = {
  steps: number;
  toolCalls: number;
  totalMs: number;
  stepMs: number[];
  calls: Array<{ step: number; toolName: string; ms: number; ok: boolean }>;
  limit: "steps" | "toolCalls" | "time" | null;
};

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

// Polska odmiana: 1 krok, 2–4 kroki, 5+ kroków (12–14 też „kroków”).
function plural(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

const LIMIT_LABELS = { steps: "limit kroków", toolCalls: "limit wywołań narzędzi", time: "limit czasu" };

function AnswerStats({ message }: { message: UIMessage }) {
  if (message.role !== "assistant") return null;
  const stats = (message.metadata as { stats?: AnswerStatsData } | undefined)?.stats;
  if (!stats) return null;
  const { steps, toolCalls, totalMs, stepMs, calls, limit } = stats;
  return (
    <small className="answer-stats">
      <span>
        {steps} {plural(steps, "krok", "kroki", "kroków")} · {toolCalls}{" "}
        {plural(toolCalls, "wywołanie narzędzia", "wywołania narzędzi", "wywołań narzędzi")} · razem {seconds(totalMs)}
        {limit && ` · ${LIMIT_LABELS[limit]}`}
      </span>
      {stepMs.length > 0 && <span>kroki: {stepMs.map((ms, i) => `${i + 1}. ${seconds(ms)}`).join(" · ")}</span>}
      {calls.length > 0 && (
        <span>
          narzędzia:{" "}
          {calls
            .map((c) => `${c.ok ? "" : "✗ "}${c.step}. ${TOOL_LABELS[c.toolName] ?? c.toolName} ${seconds(c.ms)}`)
            .join(" · ")}
        </span>
      )}
    </small>
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
// Odpowiedź (tekst po walidacji) już przyszła?
function lastHasText(messages: UIMessage[]) {
  const last = messages[messages.length - 1];
  return last?.role === "assistant" && last.parts.some((p) => p.type === "text");
}

const TOOL_LABELS: Record<string, string> = {
  vision: "👁️ analiza zdjęcia",
  generowanieObrazu: "🎨 generowanie obrazu",
  generujObraz: "🎨 generowanie obrazu",
  wyszukajWInternecie: "🔎 wyszukiwanie",
  web_search: "🔎 wyszukiwanie",
  pogoda: "🌤️ pogoda",
  waluty: "💱 waluty",
  swieta: "🎉 święta",
  wikipedia: "📖 Wikipedia",
  kalkulator: "🧮 kalkulator",
  czas: "🕒 czas",
  strefaCzasowa: "🌍 strefa czasowa",
  przeliczCzas: "🌐 przeliczanie czasu",
  dniRobocze: "📅 dni robocze",
  firma: "🏢 firma",
  notatki: "📝 notatki",
  diagnostyka: "🩺 diagnostyka",
  kursKrypto: "🦎🪙 kursKrypto",
  // Stare nazwy (lekcja 3) – dla rozmów sprzed zmiany.
  aktualnyCzas: "🕒 czas",
  kursWaluty: "💱 waluty",
};

function ToolLabels({ message, previous }: { message: UIMessage; previous?: UIMessage }) {
  if (message.role !== "assistant") return null;

  // Kroki agenta po kolei. Każdy krok modelu zaczyna się częścią "step-start";
  // w jednym kroku może być kilka narzędzi (wywołanych równolegle) – liczymy je (×2).
  // Krok bez narzędzi (np. samo „odpowiedz”, ukryte przez serwer) pomijamy.
  const steps: { name: string; count: number }[][] = [];
  const push = (name: string) => {
    if (steps.length === 0) steps.push([]);
    const current = steps[steps.length - 1];
    const same = current.find((t) => t.name === name);
    if (same) same.count++;
    else current.push({ name, count: 1 });
  };
  // Obraz wygenerowany przyciskiem „Wygeneruj obraz”.
  if (isGeneratedImageMessage(message)) push("generowanieObrazu");
  // Odpowiedź na wiadomość ze zdjęciem (Vision).
  else if (previous?.role === "user" && previous.parts.some((p) => p.type === "file")) push("vision");
  let sawSearch = false;
  for (const part of message.parts) {
    if (part.type === "step-start") steps.push([]);
    else if (isToolUIPart(part)) push(getToolName(part));
    // Wyszukiwanie OpenRoutera działa po stronie OpenRoutera — śladem są źródła (jedna etykieta na blok źródeł).
    else if (part.type === "source-url") {
      const hasSearchTool = message.parts.some(
        (p) => isToolUIPart(p) && getToolName(p) === "wyszukajWInternecie",
      );
      if (!hasSearchTool && !sawSearch) push("web_search");
      sawSearch = true;
    }
  }
  const used = steps.filter((tools) => tools.length > 0);
  if (used.length === 0) return null;

  return (
    <div className="tool-labels" aria-label="Kroki agenta po kolei">
      {used.map((tools, i) => (
        <span key={i} className="tool-step">
          {i > 0 && <span className="tool-arrow">→</span>}
          <span className="tool-label">
            {i + 1}.{" "}
            {tools
              .map(({ name, count }) => `${TOOL_LABELS[name] ?? `🛠 ${name}`}${count > 1 ? ` ×${count}` : ""}`)
              .join(" + ")}
          </span>
        </span>
      ))}
    </div>
  );
}

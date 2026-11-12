"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

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
}: {
  id: string;
  api: string;
  allowImages?: boolean;
}) {
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api,
        // Wygenerowane obrazy są tylko do wyświetlenia – nie wysyłamy ich modelowi czatu.
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: {
            id,
            trigger,
            messageId,
            messages: messages.filter((m) => !isGeneratedImageMessage(m)),
          },
        }),
      }),
  );
  const { messages, sendMessage, setMessages, status, error } = useChat({ id, transport });
  const [generating, setGenerating] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = status === "submitted" || status === "streaming" || generating;
  const canSend = (input.trim() !== "" || image !== null) && !busy;
  const canGenerate = input.trim() !== "" && input.length <= 500 && !image && !busy;

  // „Wygeneruj obraz”: wpisany tekst -> /api/image -> obraz w rozmowie.
  async function handleGenerate() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setImageGenError(null);
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
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.image) {
        throw new Error(data.error || "Nie udało się wygenerować obrazu.");
      }
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
      setImageGenError(err instanceof Error ? err.message : "Nie udało się wygenerować obrazu.");
    } finally {
      setGenerating(false);
    }
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
      <p className="hint">Endpoint: {api}</p>

      <section className="messages" aria-label="Rozmowa" aria-live="polite">
        {messages.map((message, index) => (
          <div key={message.id} className={`message ${message.role}`}>
            <span className="author">
              {message.role === "user" ? "Ty" : "Chatbot"}
            </span>
            <ToolLabels message={message} />
            {message.parts.map((part, i) => {
              if (part.type === "text") return <p key={i}>{part.text}</p>;
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
          </div>
        ))}

        {status === "submitted" && <p className="pending">Chatbot myśli…</p>}
        {generating && <p className="pending">Generuję obraz…</p>}
        {imageGenError && (
          <p className="error" role="alert">
            {imageGenError}
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error.message || "Coś poszło nie tak. Spróbuj ponownie."}
          </p>
        )}
      </section>

      {allowImages && (image || imageError) && (
        <p className={imageError ? "error" : "hint"} role={imageError ? "alert" : undefined}>
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
        <button type="submit" disabled={!canSend}>
          {busy ? "Czekaj…" : "Wyślij"}
        </button>
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
            <button
              key={hint}
              type="button"
              className="hint-chip"
              onClick={() => setInput(hint)}
              disabled={busy}
              title={hint}
            >
              {hint.split(":")[0]}
            </button>
          ))}
        </div>
      )}
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

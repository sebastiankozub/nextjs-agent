import type { UIMessage } from "ai";
import { isGeneratedImageMessage } from "./messages";

type Part = UIMessage["parts"][number];

/** Jedna część wiadomości: tekst, obraz z narzędzia generujObraz albo zdjęcie (wysłane / wygenerowane). */
export function MessagePart({ part, message }: { part: Part; message: UIMessage }) {
  if (part.type === "text") return <p>{part.text}</p>;
  if (part.type === "tool-generujObraz") return <ImageToolResult part={part} />;
  if (part.type === "file" && part.mediaType.startsWith("image/")) {
    const generated = isGeneratedImageMessage(message);
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={generated ? "generated" : "thumb"} src={part.url} alt={part.filename ?? "Wysłane zdjęcie"} />
        {generated && (
          <a className="download" href={part.url} download={part.filename ?? "obraz.png"}>
            Pobierz
          </a>
        )}
      </div>
    );
  }
  return null;
}

/** Wynik narzędzia generujObraz: obraz w czacie (model dostał tylko krótki tekst). */
function ImageToolResult({ part }: { part: Extract<Part, { type: `tool-${string}` }> }) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return <p className="pending">Generuję obraz…</p>;
  }
  if (part.state === "output-error") return <p className="error">Nie udało się wygenerować obrazu.</p>;
  if (part.state !== "output-available") return null;

  const out = part.output as { image?: string; modelId?: string | null; blad?: string };
  if (out.blad || !out.image) return <p className="error">{out.blad ?? "Nie udało się wygenerować obrazu."}</p>;
  const mediaType = /^data:([^;]+);/.exec(out.image)?.[1] ?? "image/png";
  const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="generated" src={out.image} alt="Wygenerowany obraz" />
      <a className="download" href={out.image} download={`studio-nova-obraz.${ext}`}>
        Pobierz
      </a>
      {out.modelId && <small className="model-used">model obrazu: {out.modelId}</small>}
    </div>
  );
}

import type { FormEvent } from "react";
import { IMAGE_ACCEPT, type ImageAttachment } from "./use-image-attachment";

// Podpowiedzi opisów obrazu w temacie Studio Nova (klik = wstawienie do pola wiadomości).
const IMAGE_PROMPT_HINTS = [
  "Grafika na post: zaproszenie na 45-minutową konsultację online Studio Nova, nowoczesny minimalistyczny styl, granat i biel",
  "Baner na stronę: osoba przy laptopie podczas rozmowy wideo z doradcą, jasne biuro, ciepłe światło, format 16:9",
  "Ikona do newslettera: kalendarz z dymkiem czatu i gwiazdką, płaska grafika wektorowa, dwa kolory, białe tło",
];

type Props = {
  input: string;
  setInput: (value: string) => void;
  attachment: ImageAttachment;
  /** Zdjęcia i generowanie obrazu (tylko czat, który obsługuje Vision). */
  allowImages: boolean;
  busy: boolean;
  agentWorking: boolean;
  onSubmit: () => void;
  onStop: () => void;
  onGenerate: () => void;
};

/** Pasek pod rozmową: załącznik, pole wiadomości, Wyślij / Stop, Wygeneruj obraz, podpowiedzi. */
export function Composer({ input, setInput, attachment, allowImages, busy, agentWorking, onSubmit, onStop, onGenerate }: Props) {
  const { image, imageError, fileInputRef, handleFileChange, clearImage } = attachment;
  const canSend = (input.trim() !== "" || image !== null) && !busy;
  const canGenerate = input.trim() !== "" && input.length <= 500 && !image && !busy;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return (
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
            <input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT} onChange={handleFileChange} hidden />
            <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
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
          <button type="button" className="stop" onClick={onStop} title="Przerwij pracę agenta">
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
            onClick={onGenerate}
            disabled={!canGenerate}
            title="Wpisany tekst zostanie użyty jako opis obrazu (maks. 500 znaków)"
          >
            Wygeneruj obraz
          </button>
        )}
      </form>

      {allowImages && <ImageHints onPick={setInput} disabled={busy} />}
    </div>
  );
}

function ImageHints({ onPick, disabled }: { onPick: (hint: string) => void; disabled: boolean }) {
  return (
    <div className="image-hints" aria-label="Podpowiedzi opisów obrazu">
      <span>Pomysły na obraz:</span>
      {IMAGE_PROMPT_HINTS.map((hint) => {
        const label = hint.split(":")[0];
        // Po najechaniu / fokusie chip rozwija się ku górze i pokazuje cały prompt.
        return (
          <button
            key={hint}
            type="button"
            className="hint-chip"
            onClick={() => onPick(hint)}
            disabled={disabled}
            aria-label={`Wstaw opis obrazu: ${hint}`}
          >
            <span className="chip-short">{label}</span>
            <span className="chip-full" aria-hidden="true">
              <strong>{label}:</strong>
              {hint.slice(hint.indexOf(":") + 1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

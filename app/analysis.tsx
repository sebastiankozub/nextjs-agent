"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

type Analysis = {
  category: "sales" | "support" | "billing" | "unknown";
  priority: "normal" | "high";
  draft: string;
  needs_review: boolean;
};

type Outcome =
  | { ok: true; analysis: Analysis; reply?: string }
  | { ok: false; kind: string; message: string; details?: string[] };

// Analiza zdjęcia dokumentu: koperta { header, body } z /api/analyze-image.
type DocResult = {
  header: {
    typ_dokumentu: string;
    czytelnosc: "dobra" | "czesciowa" | "zla";
    needs_review: boolean;
    powod_sprawdzenia: string | null;
    pola_niepewne: string[];
  };
  body: Record<string, unknown>;
  typ_label: string;
  pola: Record<string, string>;
  kontrole_serwera: string[];
  needs_review: boolean;
  modelId: string;
};

type DocOutcome =
  | { ok: true; result: DocResult }
  | { ok: false; kind: string; message: string; details?: string[] };

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const CZYTELNOSC: Record<DocResult["header"]["czytelnosc"], string> = {
  dobra: "dobra",
  czesciowa: "częściowa",
  zla: "zła",
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageError, setImageError] = useState<string | null>(null);
  const [analyzedImage, setAnalyzedImage] = useState<string | null>(null);
  const [docOutcome, setDocOutcome] = useState<DocOutcome | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearImage() {
    setImage(null);
    setImageName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImageError(null);
    if (!file) return clearImage();
    // Sprawdzenie w przeglądarce – zły plik nie leci na serwer.
    if (!IMAGE_ACCEPT.split(",").includes(file.type)) {
      setImageError("Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.");
      return clearImage();
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError("Zdjęcie jest za duże (maks. 4 MB).");
      return clearImage();
    }
    setImage(await readAsDataUrl(file));
    setImageName(file.name);
  }

  async function analyzeImage() {
    if (!image || busy) return;
    setBusy(true);
    setOutcome(null);
    setDocOutcome(null);
    setAnalyzed("");
    setAnalyzedImage(image);
    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const body = await res.json().catch(() => null);
      if (body && typeof body === "object" && "ok" in body) {
        setDocOutcome(body as DocOutcome);
      } else {
        setDocOutcome({ ok: false, kind: "http", message: `Nieoczekiwana odpowiedź serwera (HTTP ${res.status}). Brak analizy.` });
      }
    } catch {
      setDocOutcome({ ok: false, kind: "network", message: "Brak połączenia z serwerem. Brak analizy." });
    } finally {
      setBusy(false);
      clearImage();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (image) return analyzeImage();
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setOutcome(null);
    setDocOutcome(null);
    setAnalyzedImage(null);
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
          Wklej wiadomość klienta albo dodaj zdjęcie (wizytówka, paragon, zrzut wiadomości).
          Wynik to tylko szkic — nic nie jest wysyłane.
        </p>

        {analyzed && (
          <div className="message user">
            <span className="author">Wiadomość klienta</span>
            <p>{analyzed}</p>
          </div>
        )}

        {analyzedImage && (
          <div className="message user">
            <span className="author">Zdjęcie do analizy</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="thumb" src={analyzedImage} alt="Zdjęcie do analizy" />
          </div>
        )}

        {busy && <p className="pending">Analizuję…</p>}

        {docOutcome?.ok === true && <DocumentResult result={docOutcome.result} />}

        {docOutcome?.ok === false && (
          <div className="error" role="alert">
            <p>{docOutcome.message}</p>
            {docOutcome.details && (
              <ul>
                {docOutcome.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

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
            <p className="draft">{outcome.reply ?? outcome.analysis.draft}</p>
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

      {(imageName || imageError) && (
        <p className={imageError ? "error" : "hint"} role={imageError ? "alert" : undefined}>
          {imageError ?? (
            <>
              📎 {imageName}{" "}
              <button type="button" className="link" onClick={clearImage} disabled={busy}>
                usuń
              </button>
            </>
          )}
        </p>
      )}

      <form className="composer" onSubmit={handleSubmit}>
        <input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT} onChange={handleFileChange} hidden />
        <button
          type="button"
          className="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          Dodaj zdjęcie
        </button>
        <input
          type="text"
          name="client-message"
          placeholder={image ? "Analizuję zdjęcie (tekst nie jest używany)" : "Wiadomość klienta do analizy…"}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy || image !== null}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || (input.trim() === "" && !image)}>
          {busy ? "Czekaj…" : "Analizuj"}
        </button>
      </form>
    </>
  );
}

// Wynik analizy zdjęcia: nagłówek (wspólny) + body (pola typu, z etykietami z serwera).
function DocumentResult({ result }: { result: DocResult }) {
  const { header, body, pola } = result;
  const niepewne = new Set(header.pola_niepewne);

  return (
    <div className="analysis">
      <span className="author">Nagłówek</span>
      <dl>
        <dt>Typ dokumentu</dt>
        <dd>{result.typ_label}</dd>
        <dt>Czytelność</dt>
        <dd>{CZYTELNOSC[header.czytelnosc]}</dd>
        <dt>Status sprawdzenia</dt>
        <dd className={result.needs_review ? "high" : ""}>
          {result.needs_review ? "Wymaga sprawdzenia przez pracownika" : "Bez dodatkowej decyzji"}
        </dd>
        {header.powod_sprawdzenia && (
          <>
            <dt>Powód (model)</dt>
            <dd>{header.powod_sprawdzenia}</dd>
          </>
        )}
        {result.kontrole_serwera.length > 0 && (
          <>
            <dt>Kontrole serwera</dt>
            <dd>
              <ul>
                {result.kontrole_serwera.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      <span className="author">Dane z dokumentu</span>
      <dl>
        {Object.entries(pola).map(([key, label]) => (
          <FieldRow key={key} label={label} value={body[key]} uncertain={niepewne.has(key)} />
        ))}
      </dl>
      <small className="model-used">model: {result.modelId}</small>
    </div>
  );
}

function FieldRow({ label, value, uncertain }: { label: string; value: unknown; uncertain: boolean }) {
  return (
    <>
      <dt>
        {label}
        {uncertain && <span title="Wartość niepewna"> ⚠️</span>}
      </dt>
      <dd>
        <FieldValue value={value} />
      </dd>
    </>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <>—</>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <>—</>;
    return (
      <ul>
        {value.map((item, i) => (
          <li key={i}>
            {item && typeof item === "object"
              ? Object.values(item as Record<string, unknown>).join(" · ")
              : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    // np. analiza wiadomości ze zrzutu ekranu
    const v = value as Record<string, unknown>;
    if ("category" in v && "draft" in v) {
      return (
        <>
          <p>
            Kategoria: {String(v.category)} · Priorytet: {String(v.priority)} ·{" "}
            {v.needs_review ? "wymaga sprawdzenia" : "bez dodatkowej decyzji"}
          </p>
          <p className="draft">{String(v.draft)}</p>
        </>
      );
    }
    return <pre>{JSON.stringify(value, null, 2)}</pre>;
  }
  return <>{String(value)}</>;
}

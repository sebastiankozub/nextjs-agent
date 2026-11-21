"use client";

import { useState, type FormEvent } from "react";

const MAX_TITLE = 200;
const MAX_CONTENT = 20_000;

type DocumentInfo = { id: number; title: string; createdAt: string; chunkCount: number };
type Stage = "split" | "embed" | "save";
type StageState = "waiting" | "active" | "done" | "failed";

// Etapy importu – te same, które zgłasza serwer (lib/knowledge.ts).
const STAGES: { id: Stage; label: string; name: string }[] = [
  { id: "split", label: "Dzielę tekst…", name: "dzielenie tekstu" },
  { id: "embed", label: "Tworzę embeddingi…", name: "tworzenie embeddingów" },
  { id: "save", label: "Zapisuję…", name: "zapis do bazy" },
];

type Status =
  | { kind: "ok"; text: string; warnings: string[] }
  | { kind: "error"; text: string; stage?: Stage; hint?: string };

type DoneEvent = {
  type: "done";
  title: string;
  chunkCount: number;
  backfilled: number;
  replaced: number;
  warnings: string[];
};
type ImportEvent =
  | { type: "stage"; stage: Stage }
  | DoneEvent
  | { type: "error"; stage: Stage; error: string; hint: string };

// 1 fragment, 2–4 fragmenty, 5+ fragmentów (12–14 też „fragmentów”).
function fragmenty(n: number): string {
  if (n === 1) return "fragment";
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "fragmenty" : "fragmentów";
}

const titleKey = (t: string) => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("pl-PL");

// Stała strefa czasowa – ta sama data na serwerze i w przeglądarce.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" });

export default function UploadForm({
  initialDocuments,
  initialListError,
  fixedChunk,
}: {
  initialDocuments: DocumentInfo[];
  initialListError: string | null;
  fixedChunk: { size: number; overlap: number };
}) {
  const [title, setTitle] = useState("");
  // Sposób dzielenia tekstu – domyślnie akapity.
  const [method, setMethod] = useState<"paragraphs" | "fixed">("paragraphs");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<Record<Stage, StageState> | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [listError, setListError] = useState(initialListError);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function refreshList() {
    try {
      const res = await fetch("/api/knowledge", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nie udało się wczytać listy dokumentów.");
      setDocuments(data.documents as DocumentInfo[]);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error && !(err instanceof TypeError) ? err.message : "Nie udało się wczytać listy dokumentów.");
    }
  }

  function confirmReplace(existing: DocumentInfo[]): boolean {
    const old = existing[0];
    const info = old ? ` (dodany ${formatDate(old.createdAt)}, ${old.chunkCount} ${fragmenty(old.chunkCount)})` : "";
    return window.confirm(
      `Dokument „${old?.title ?? title.trim()}”${info} jest już w bazie.\n\n` +
        "Zastąpić go nową wersją? Stare fragmenty zostaną usunięte, zostaną tylko nowe.",
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    // Puste pola – komunikat od razu, bez wysyłania.
    if (!title.trim()) return setStatus({ kind: "error", text: "Wpisz tytuł dokumentu." });
    if (!content.trim()) return setStatus({ kind: "error", text: "Wklej treść dokumentu." });

    // Ten sam tytuł = nowa wersja. Najpierw pytamy o zgodę.
    const sameTitle = documents.filter((d) => titleKey(d.title) === titleKey(title));
    if (sameTitle.length > 0 && !confirmReplace(sameTitle)) return;
    await runImport(sameTitle.length > 0);
  }

  async function runImport(replace: boolean) {
    setBusy(true);
    setStatus(null);
    setStages({ split: "waiting", embed: "waiting", save: "waiting" });
    let current: Stage | null = null;
    const mark = (stage: Stage, state: StageState) => setStages((s) => (s ? { ...s, [stage]: state } : s));

    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content, replace, method }),
      });

      // Zwykła odpowiedź JSON = błąd danych, sesji albo konflikt tytułu (lista była nieaktualna).
      if (!(res.headers.get("content-type") ?? "").includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.conflict) {
          setStages(null);
          setBusy(false);
          await refreshList();
          if (confirmReplace(data.existing as DocumentInfo[])) await runImport(true);
          return;
        }
        setStages(null);
        setStatus({
          kind: "error",
          text: data.error || "Nie udało się dodać dokumentu.",
          hint: res.status === 401 ? "Odśwież stronę (F5) i zaloguj się ponownie. Tekst skopiuj wcześniej, żeby go nie stracić." : undefined,
        });
        return;
      }

      // Strumień etapów: jedna linia JSON na zdarzenie.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as ImportEvent;
          if (ev.type === "stage") {
            if (current) mark(current, "done");
            current = ev.stage;
            mark(ev.stage, "active");
          } else if (ev.type === "done") {
            if (current) mark(current, "done");
            finished = true;
            setStatus({ kind: "ok", text: successText(ev), warnings: ev.warnings });
            setTitle("");
            setContent("");
          } else {
            mark(ev.stage, "failed");
            finished = true;
            setStatus({ kind: "error", stage: ev.stage, text: ev.error, hint: ev.hint });
          }
        }
      }
      if (!finished) {
        // Połączenie urwało się w trakcie – nie wiemy, czy zapis się udał.
        if (current) mark(current, "failed");
        setStatus({
          kind: "error",
          stage: current ?? undefined,
          text: "Połączenie z serwerem urwało się w trakcie importu.",
          hint: "Sprawdź na liście poniżej, czy dokument się pojawił. Jeśli nie – sprawdź, czy działa npm run dev, i spróbuj ponownie.",
        });
      }
    } catch (err) {
      if (current) mark(current, "failed");
      setStatus({
        kind: "error",
        stage: current ?? undefined,
        text: err instanceof TypeError ? "Brak połączenia z serwerem." : "Nie udało się dodać dokumentu.",
        hint: "Sprawdź, czy działa npm run dev, i spróbuj ponownie.",
      });
    } finally {
      setBusy(false);
      await refreshList();
    }
  }

  function successText(ev: DoneEvent): string {
    let text = `Zapisano dokument „${ev.title}”: ${ev.chunkCount} ${fragmenty(ev.chunkCount)}`;
    if (ev.replaced > 0) text += ". Poprzednia wersja została zastąpiona";
    if (ev.backfilled > 0)
      text += `. Uzupełniono też embeddingi ${ev.backfilled} starszych ${ev.backfilled === 1 ? "fragmentu" : "fragmentów"}`;
    return text;
  }

  async function handleDelete(doc: DocumentInfo) {
    if (deleting !== null || busy) return;
    if (!window.confirm(`Usunąć dokument „${doc.title}” z bazy wiedzy? Wszystkie jego fragmenty (${doc.chunkCount}) zostaną usunięte na zawsze.`)) return;
    setDeleting(doc.id);
    setListError(null);
    try {
      const res = await fetch(`/api/knowledge/${doc.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      // 404 = dokumentu już nie ma, więc i tak odświeżamy listę.
      if (!res.ok && res.status !== 404) throw new Error(data.error || "Nie udało się usunąć dokumentu.");
      await refreshList();
    } catch (err) {
      setListError(err instanceof Error && !(err instanceof TypeError) ? err.message : "Nie udało się usunąć dokumentu – brak połączenia z serwerem.");
    } finally {
      setDeleting(null);
    }
  }

  const stageName = (stage?: Stage) => STAGES.find((s) => s.id === stage)?.name;

  return (
    <>
      <form className="profile-form upload-form" onSubmit={handleSubmit} noValidate>
        <fieldset className="upload-fields" disabled={busy}>
          <label className="profile-field">
            <span>Tytuł</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE} placeholder="np. Cennik 2026" />
          </label>

          <label className="profile-field">
            <span>
              Treść{" "}
              <span className="char-count">
                ({content.length.toLocaleString("pl-PL")} / {MAX_CONTENT.toLocaleString("pl-PL")} znaków)
              </span>
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CONTENT}
              rows={16}
              placeholder="Wklej tekst dokumentu. Akapity oddziel pustą linią."
            />
          </label>

          <div className="profile-field upload-method" role="radiogroup" aria-label="Sposób dzielenia tekstu">
            <span>Sposób dzielenia tekstu</span>
            <label>
              <input type="radio" name="method" value="paragraphs" checked={method === "paragraphs"} onChange={() => setMethod("paragraphs")} />{" "}
              akapity <span className="char-count">(jeden akapit = jeden fragment)</span>
            </label>
            <label>
              <input type="radio" name="method" value="fixed" checked={method === "fixed"} onChange={() => setMethod("fixed")} />{" "}
              stałe kawałki{" "}
              <span className="char-count">
                (po {fixedChunk.size} znaków z zakładką {fixedChunk.overlap})
              </span>
            </label>
          </div>
        </fieldset>

        <div className="profile-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Importuję…" : "Dodaj do bazy wiedzy"}
          </button>
        </div>

        {stages && (
          <ol className="upload-stages" aria-live="polite">
            {STAGES.map((s) => (
              <li key={s.id} className={`upload-stage ${stages[s.id]}`}>
                <span aria-hidden="true">
                  {stages[s.id] === "done" ? "✓" : stages[s.id] === "failed" ? "✗" : stages[s.id] === "active" ? "⏳" : "○"}
                </span>{" "}
                {s.label}
              </li>
            ))}
          </ol>
        )}

        {status?.kind === "ok" && (
          <div role="status">
            <p className="hint">✓ {status.text}</p>
            {status.warnings.map((w) => (
              <p key={w} className="msg-error">
                ⚠️ {w}
              </p>
            ))}
          </div>
        )}
        {status?.kind === "error" && (
          <div className="msg-error upload-error" role="alert">
            <p>
              ⚠️ {status.stage ? <strong>Import nie udał się na etapie: {stageName(status.stage)}. </strong> : null}
              {status.text}
            </p>
            {status.hint && (
              <p>
                <strong>Co możesz zrobić:</strong> {status.hint}
              </p>
            )}
          </div>
        )}
      </form>

      <section className="upload-docs" aria-labelledby="docs-heading">
        <h2 id="docs-heading">Dokumenty w bazie wiedzy</h2>
        {listError && (
          <p className="msg-error" role="alert">
            ⚠️ {listError}
          </p>
        )}
        {documents.length === 0 && !listError ? (
          <p className="hint">Baza wiedzy jest pusta. Dodaj pierwszy dokument formularzem powyżej.</p>
        ) : (
          <ul className="history-list">
            {documents.map((doc) => (
              <li key={doc.id} className="history-row">
                <div className="history-item">
                  <span className="history-title" title="Nazwa źródła">
                    {doc.title}
                  </span>
                  <span className="history-meta">
                    wersja z {formatDate(doc.createdAt)} · {doc.chunkCount} {fragmenty(doc.chunkCount)}
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary history-delete"
                  onClick={() => handleDelete(doc)}
                  disabled={deleting !== null || busy}
                >
                  {deleting === doc.id ? "Usuwam…" : "Usuń"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

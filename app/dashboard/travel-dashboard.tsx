"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import ThemePicker from "../theme-picker";
import { SOURCE_LABELS, TRAVEL_SOURCES, type TravelCard, type TravelSource } from "../../lib/travel";

// Stan karty: „Ładuję…”, „OK” albo „Brak danych”. Nigdy danych zastępczych.
type CardState = { status: "idle" } | { status: "loading" } | { status: "done"; card: TravelCard };
type CityCards = Record<TravelSource, CardState>;

type Summary =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; text: string; fetchedAt: string; polecam?: string | null }
  | { status: "error"; message: string };

type Mode = "single" | "compare";
type Query = { miasta: string[]; data: string };

const ICONS: Record<TravelSource, string> = { pogoda: "🌤️", waluty: "💱", swieta: "🎉", wikipedia: "📖", czas: "🕒" };
const REQUEST_TIMEOUT_MS = 30_000;

const todayInPoland = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const allCards = (status: "idle" | "loading") =>
  Object.fromEntries(TRAVEL_SOURCES.map((s) => [s, { status }])) as CityCards;
const errorCard = (reason: string): TravelCard => ({ ok: false, reason, source: "—", fetchedAt: new Date().toISOString() });

// Jedna karta z serwera. Błąd sieci albo zła odpowiedź = „Brak danych” (bez zgadywania).
async function loadCard(source: TravelSource, miasto: string, data: string): Promise<TravelCard> {
  try {
    const params = new URLSearchParams({ zrodlo: source, miasto, data });
    const res = await fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const body = await res.json().catch(() => null);
    if (res.status === 401) return errorCard("Sesja wygasła – zaloguj się ponownie.");
    if (!res.ok || !body || typeof body.ok !== "boolean") return errorCard(body?.message ?? "Serwer nie odpowiedział poprawnie.");
    return body as TravelCard;
  } catch {
    return errorCard("Źródło nie odpowiada.");
  }
}

// Karty w postaci dla agenta: tylko wartości kart OK, przy braku – samo ok: false.
const forAgent = (cards: Record<TravelSource, TravelCard>) =>
  Object.fromEntries(
    TRAVEL_SOURCES.map((s) => {
      const c = cards[s];
      return [s, c.ok ? { ok: true, value: c.value, details: c.details, source: c.source } : { ok: false }];
    }),
  );

async function postJson(url: string, body: unknown): Promise<Summary> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok && typeof data.text === "string") {
      return { status: "ok", text: data.text, fetchedAt: data.fetchedAt, polecam: data.polecam };
    }
    return { status: "error", message: data?.message ?? "Agent nie odpowiedział." };
  } catch {
    return { status: "error", message: "Agent nie odpowiedział." };
  }
}

export default function TravelDashboard() {
  const [mode, setMode] = useState<Mode>("single");
  const [miasto, setMiasto] = useState("");
  const [miasto2, setMiasto2] = useState("");
  const [data, setData] = useState(todayInPoland);
  const [query, setQuery] = useState<Query | null>(null);
  const [cards, setCards] = useState<CityCards[]>([]);
  const [summary, setSummary] = useState<Summary>({ status: "idle" });
  // Numer sprawdzenia – odpowiedzi ze starszego kliknięcia są ignorowane.
  const runId = useRef(0);

  const loading = cards.some((c) => TRAVEL_SOURCES.some((s) => c[s].status === "loading")) || summary.status === "loading";
  const m1 = miasto.trim();
  const m2 = miasto2.trim();
  const sameCity = mode === "compare" && m1.length >= 2 && m1.toLowerCase() === m2.toLowerCase();
  const canCheck = !loading && !!data && m1.length >= 2 && (mode === "single" || (m2.length >= 2 && !sameCity));

  async function check(q: Query) {
    const id = ++runId.current;
    setQuery(q);
    setSummary({ status: "loading" });
    setCards(q.miasta.map(() => allCards("loading")));

    // Wszystkie karty (5 albo 10) równolegle; każda aktualizuje się, gdy tylko przyjdą jej dane.
    const results = await Promise.all(
      q.miasta.map(async (m, i) => {
        const pairs = await Promise.all(
          TRAVEL_SOURCES.map(async (s) => {
            const card = await loadCard(s, m, q.data);
            if (runId.current === id) {
              setCards((prev) => prev.map((c, j) => (j === i ? { ...c, [s]: { status: "done", card } } : c)));
            }
            return [s, card] as const;
          }),
        );
        return Object.fromEntries(pairs) as Record<TravelSource, TravelCard>;
      }),
    );
    if (runId.current !== id) return;

    // Podsumowanie / rekomendacja dopiero, gdy WSZYSTKIE karty skończyły (OK albo Brak danych).
    const result =
      q.miasta.length === 1
        ? await postJson("/api/dashboard/summary", { miasto: q.miasta[0], data: q.data, karty: forAgent(results[0]) })
        : await postJson("/api/dashboard/compare", {
            data: q.data,
            miasta: q.miasta.map((m, i) => ({ miasto: m, karty: forAgent(results[i]) })),
          });
    if (runId.current === id) setSummary(result);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCheck) return;
    check({ miasta: mode === "single" ? [m1] : [m1, m2], data });
  }

  function switchMode(next: Mode) {
    if (next === mode || loading) return;
    runId.current++; // porzucamy wyniki poprzedniego trybu
    setMode(next);
    setQuery(null);
    setCards([]);
    setSummary({ status: "idle" });
  }

  return (
    <main className="chat travel">
      <header className="chat-header">
        <div className="header-row">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">✈</span>
            <div>
              <h1>Asystent podróży</h1>
              <p className="tagline">Pogoda, waluta, święta, opis miasta i czas na miejscu – w jednym miejscu.</p>
            </div>
          </div>
          <div className="header-actions">
            <Link href="/" className="nav-link">
              ← Czat
            </Link>
            <ThemePicker />
          </div>
        </div>

        <nav className="modes" aria-label="Tryb">
          <button type="button" className={mode === "single" ? "active" : ""} onClick={() => switchMode("single")} disabled={loading}>
            Jedno miasto
          </button>
          <button type="button" className={mode === "compare" ? "active" : ""} onClick={() => switchMode("compare")} disabled={loading}>
            Porównaj
          </button>
        </nav>

        <form className="composer travel-form" onSubmit={handleSubmit}>
          <label>
            <span>{mode === "compare" ? "Pierwsze miasto" : "Dokąd jedziesz?"}</span>
            <input type="text" value={miasto} onChange={(e) => setMiasto(e.target.value)} placeholder="np. Lizbona" maxLength={80} required />
          </label>
          {mode === "compare" && (
            <label>
              <span>Drugie miasto</span>
              <input type="text" value={miasto2} onChange={(e) => setMiasto2(e.target.value)} placeholder="np. Porto" maxLength={80} required />
            </label>
          )}
          <label>
            <span>{mode === "compare" ? "Kiedy? (ten sam termin)" : "Kiedy?"}</span>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </label>
          <button type="submit" disabled={!canCheck}>
            {mode === "compare" ? "Porównaj" : "Sprawdź"}
          </button>
          {query && (
            <button type="button" className="secondary" onClick={() => check(query)} disabled={loading}>
              Odśwież
            </button>
          )}
        </form>
        {sameCity && <p className="msg-error">Podaj dwa różne miasta.</p>}
      </header>

      {query && query.miasta.length === 1 && cards[0] && (
        <>
          <p className="hint travel-query">
            {query.miasta[0]}, {query.data}
          </p>
          <section className="travel-cards" aria-label="Dane o podróży">
            {TRAVEL_SOURCES.map((s) => (
              <Card key={s} source={s} state={cards[0][s]} />
            ))}
          </section>
        </>
      )}

      {query && query.miasta.length === 2 && cards.length === 2 && (
        <section className="travel-compare" aria-label="Porównanie miast">
          <div className="compare-row compare-head">
            {query.miasta.map((m) => (
              <h2 key={m} className={summary.status === "ok" && summary.polecam === m ? "recommended" : ""}>
                {m}
                {summary.status === "ok" && summary.polecam === m && <span className="card-status ok">polecane</span>}
              </h2>
            ))}
          </div>
          <p className="hint travel-query">termin: {query.data}</p>
          {TRAVEL_SOURCES.map((s) => (
            <div key={s} className="compare-row">
              {cards.map((c, i) => (
                <Card key={i} source={s} state={c[s]} city={query.miasta[i]} />
              ))}
            </div>
          ))}
        </section>
      )}

      {query && (
        <section className="travel-summary" aria-live="polite">
          <h2>{query.miasta.length === 2 ? "Rekomendacja agenta" : "Podsumowanie agenta"}</h2>
          {summary.status === "loading" && <p className="pending">Ładuję… (czekam na wszystkie karty)</p>}
          {summary.status === "ok" && (
            <>
              <p>{summary.text}</p>
              <small className="card-meta">pobrano: {timeLabel(summary.fetchedAt)}</small>
            </>
          )}
          {summary.status === "error" && (
            <p className="card-missing">
              Brak {query.miasta.length === 2 ? "rekomendacji" : "podsumowania"} — spróbuj odświeżyć. ({summary.message})
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function Card({ source, state, city }: { source: TravelSource; state: CardState; city?: string }) {
  const label = `${ICONS[source]} ${SOURCE_LABELS[source]}`;
  const isOk = state.status === "done" && state.card.ok;
  const status = state.status === "loading" ? "Ładuję…" : isOk ? "OK" : state.status === "idle" ? "" : "Brak danych";
  const statusClass = state.status === "loading" ? "loading" : isOk ? "ok" : "missing";

  return (
    <article className={`travel-card ${statusClass}`} aria-busy={state.status === "loading"} aria-label={city ? `${label} – ${city}` : label}>
      <header>
        <h3>{label}</h3>
        {status && <span className={`card-status ${statusClass}`}>{status}</span>}
      </header>
      {state.status === "loading" && <p className="pending">Ładuję…</p>}
      {state.status === "done" && state.card.ok && (
        <>
          <p className="card-value">{state.card.value}</p>
          {state.card.details.map((d, i) => (
            <p key={i} className="card-detail">
              {d}
            </p>
          ))}
          {state.card.link && (
            <a href={state.card.link} target="_blank" rel="noreferrer">
              Czytaj w Wikipedii
            </a>
          )}
          <small className="card-meta">
            źródło: {state.card.source} · pobrano: {timeLabel(state.card.fetchedAt)}
          </small>
        </>
      )}
      {state.status === "done" && !state.card.ok && (
        <>
          <p className="card-missing">Brak danych — spróbuj odświeżyć.</p>
          <p className="card-detail">{state.card.reason}</p>
          <small className="card-meta">
            {state.card.source !== "—" && <>źródło: {state.card.source} · </>}sprawdzono: {timeLabel(state.card.fetchedAt)}
          </small>
        </>
      )}
    </article>
  );
}

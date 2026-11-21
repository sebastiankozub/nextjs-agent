"use client";

import { useState, type FormEvent } from "react";

type Profile = { name: string | null; preferences: Record<string, string> };
type Row = { id: number; key: string; value: string };

let nextRowId = 0;
const toRows = (preferences: Record<string, string>): Row[] =>
  Object.entries(preferences).map(([key, value]) => ({ id: nextRowId++, key, value }));

// Edytor profilu na /profile: imię, pary nazwa–wartość, usuwanie pozycji, czyszczenie całości.
export default function ProfileEditor({ initial }: { initial: Profile }) {
  const [name, setName] = useState(initial.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => toRows(initial.preferences));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  function apply(profile: Profile) {
    setName(profile.name ?? "");
    setRows(toRows(profile.preferences));
  }

  async function send(method: "PUT" | "DELETE", body?: unknown) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/profile", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Nie udało się zapisać profilu.");
      apply(data as Profile);
      setStatus({ ok: true, text: method === "DELETE" ? "Profil wyczyszczony." : "Zapisano." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Nie udało się zapisać profilu." });
    } finally {
      setBusy(false);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keys = rows.map((r) => r.key.trim().toLowerCase()).filter(Boolean);
    if (new Set(keys).size !== keys.length) {
      setStatus({ ok: false, text: "Dwie pozycje mają tę samą nazwę – zostaw jedną." });
      return;
    }
    // Pozycja z nazwą, ale bez wartości też się zapisuje – agent o nią dopyta w czacie.
    const preferences = Object.fromEntries(
      rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value.trim()]),
    );
    void send("PUT", { name: name.trim() || null, preferences });
  }

  function handleClear() {
    if (!window.confirm("Wyczyścić cały profil? Asystent zapomni imię i wszystkie preferencje.")) return;
    void send("DELETE");
  }

  const update = (id: number, field: "key" | "value", value: string) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  return (
    <form className="profile-form" onSubmit={handleSave}>
      <label className="profile-field">
        <span>Imię</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="np. Ada" disabled={busy} />
      </label>

      <fieldset className="profile-prefs" disabled={busy}>
        <legend>Preferencje</legend>
        <p className="hint">
          Dodaj własną pozycję, np. „dystans przebiegnięty”. Wartość możesz zostawić pustą – agent dopyta o nią w czacie.
          Później zmieniaj ją tutaj albo pisząc w czacie, np. „dziś przebiegłem 5 km”.
        </p>
        {rows.length === 0 && <p className="hint">Brak zapisanych preferencji.</p>}
        {rows.map((row) => (
          <div key={row.id} className="profile-row">
            <input
              aria-label="Nazwa"
              value={row.key}
              onChange={(e) => update(row.id, "key", e.target.value)}
              maxLength={40}
              placeholder="nazwa, np. miasto"
            />
            <input
              aria-label="Wartość"
              value={row.value}
              onChange={(e) => update(row.id, "value", e.target.value)}
              maxLength={200}
              placeholder="puste = agent dopyta w czacie"
            />
            <button
              type="button"
              className="secondary"
              onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
              title="Usuń pozycję (zmiana zapisze się po kliknięciu „Zapisz”)"
            >
              Usuń
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setRows((current) => [...current, { id: nextRowId++, key: "", value: "" }])}
        >
          ＋ Dodaj preferencję
        </button>
      </fieldset>

      <div className="profile-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Zapisuję…" : "Zapisz"}
        </button>
        <button type="button" className="secondary" onClick={handleClear} disabled={busy}>
          Wyczyść cały profil
        </button>
        {status && (
          <p className={status.ok ? "hint" : "msg-error"} role={status.ok ? "status" : "alert"}>
            {status.ok ? "✓ " : "⚠️ "}
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}

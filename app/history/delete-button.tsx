"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Przycisk „Usuń” przy rozmowie na /history – z pytaniem o potwierdzenie.
export default function DeleteConversationButton({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (busy) return;
    if (!window.confirm(`Usunąć rozmowę „${title}”? Wiadomości zostaną usunięte z bazy na zawsze.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      // 404 = rozmowy już nie ma, więc i tak odświeżamy listę.
      if (!res.ok && res.status !== 404) throw new Error(data.error || "Nie udało się usunąć rozmowy.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się usunąć rozmowy.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="secondary history-delete" onClick={handleDelete} disabled={busy}>
        {busy ? "Usuwam…" : "Usuń"}
      </button>
      {error && (
        <p className="msg-error history-error" role="alert">
          ⚠️ {error}
        </p>
      )}
    </>
  );
}

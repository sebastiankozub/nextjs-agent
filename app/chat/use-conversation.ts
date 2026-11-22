"use client";

import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

/**
 * Numer rozmowy w bazie (lekcja 5, W2) i ostrzeżenie o błędzie bazy.
 * Numer trzymamy w refie, bo czyta go transport (tworzony raz) przy każdym wysłaniu.
 * Trafia też do adresu (/?rozmowa=…): F5 wczytuje TĘ rozmowę. null = następna wiadomość zacznie nową.
 */
export function useConversation(initialId: number | null, initialDbError: string | null, messages: UIMessage[]) {
  const conversationIdRef = useRef<number | null>(initialId);
  const [dbError, setDbError] = useState<string | null>(initialDbError);

  function rememberConversation(conversationId: number | null) {
    conversationIdRef.current = conversationId;
    if (typeof window === "undefined") return;
    const target = conversationId === null ? "/?nowa=1" : `/?rozmowa=${conversationId}`;
    if (window.location.pathname + window.location.search !== target) {
      window.history.replaceState(window.history.state, "", target);
    }
  }

  // Serwer podaje numer rozmowy (albo błąd bazy) w metadanych odpowiedzi agenta – bierzemy najnowsze.
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

  return { conversationIdRef, rememberConversation, dbError, setDbError };
}

"use client";

import type { ChatStatus, UIMessage } from "ai";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { markInterrupted } from "../../lib/analysis";

/**
 * Agent nie zdążył wszystkiego (limit kroków): serwer podsyła propozycję następnej wiadomości.
 * Wpisujemy ją w pole wiadomości (tylko gdy jest puste) – użytkownik sam decyduje, czy ją wysłać.
 */
export function useContinuation(status: ChatStatus, messages: UIMessage[], setInput: Dispatch<SetStateAction<string>>) {
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || applied.current === last.id) return;
    const continuation = (last.metadata as { continuation?: unknown } | undefined)?.continuation;
    if (typeof continuation !== "string" || !continuation.trim()) return;
    applied.current = last.id;
    setInput((current) => (current.trim() ? current : continuation));
  }, [status, messages, setInput]);
}

/**
 * „Stop”: przerywa zadanie agenta. Gdy status wróci do "ready", dopisujemy do rozmowy
 * to, co agent zdążył zrobić, i „Przerwane przez użytkownika”.
 */
export function useAgentStop(status: ChatStatus, stop: () => void, setMessages: (fn: (m: UIMessage[]) => UIMessage[]) => void) {
  const stopRequested = useRef(false);
  useEffect(() => {
    if (status === "submitted" || status === "streaming" || !stopRequested.current) return;
    stopRequested.current = false;
    setMessages((current) => markInterrupted(current));
  }, [status, setMessages]);

  return () => {
    stopRequested.current = true;
    stop();
  };
}

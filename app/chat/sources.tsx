"use client";

import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";

// Lista „Źródła” pod odpowiedzią (tylko gdy model użył wyszukiwania).
export function Sources({ message }: { message: UIMessage }) {
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

// --- Lekcja 6, W3 (Standard): źródła z bazy wiedzy pod odpowiedzią ---

type KnowledgeFragment = { id: number; tytul: string; tresc: string; podobienstwo: number };

const normTitle = (t: string) => t.replace(/[„”"'\[\]]/g, "").trim().toLocaleLowerCase("pl-PL");

/**
 * Fragmenty użyte w odpowiedzi. Najpierw dokładna lista z serwera (metadane knowledgeSources).
 * Gdy model nie wskazał numerów – wyniki searchKnowledge (powyżej progu) z dokumentów wymienionych
 * w linii „📎 Źródło: …”. Brak tej linii = agent nie odpowiedział z bazy – wtedy nie pokazujemy źródeł.
 */
function usedFragments(message: UIMessage): KnowledgeFragment[] {
  // Dokładnie: serwer podaje fragmenty wskazane przez model w odpowiedzi (zrodlaBazyWiedzy),
  // sprawdzone z wynikami searchKnowledge. Pusta lista = odpowiedź nie korzysta z bazy.
  const fromServer = (message.metadata as { knowledgeSources?: KnowledgeFragment[] } | undefined)?.knowledgeSources;
  if (Array.isArray(fromServer) && fromServer.length > 0) return fromServer;
  // Zapas (model nie wskazał numerów): fragmenty z dokumentów wymienionych w linii „📎 Źródło”.
  const all = new Map<number, KnowledgeFragment>();
  for (const part of message.parts) {
    if (!isToolUIPart(part) || getToolName(part) !== "searchKnowledge" || part.state !== "output-available") continue;
    const out = part.output as { fragmenty?: KnowledgeFragment[] } | undefined;
    for (const f of out?.fragmenty ?? []) if (!all.has(f.id)) all.set(f.id, f);
  }
  if (all.size === 0) return [];
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
  const line = /📎\s*Źródło:\s*(.+)/.exec(text)?.[1];
  if (!line) return [];
  const cited = line.split(/[,;]/).map(normTitle).filter(Boolean);
  const fragments = [...all.values()];
  const matching = fragments.filter((f) => cited.some((c) => c === normTitle(f.tytul) || c.includes(normTitle(f.tytul))));
  // Tytuł w linii źródła różni się od zapisanego (np. literówka modelu) – pokazujemy wszystkie znalezione.
  return (matching.length > 0 ? matching : fragments).sort((a, b) => b.podobienstwo - a.podobienstwo);
}

export function KnowledgeSources({ message }: { message: UIMessage }) {
  if (message.role !== "assistant") return null;
  const fragments = usedFragments(message);
  if (fragments.length === 0) return null;
  return (
    <div className="sources knowledge-sources">
      <strong>Źródła z bazy wiedzy</strong>
      <ul>
        {fragments.map((f) => (
          <KnowledgeSourceItem key={f.id} fragment={f} />
        ))}
      </ul>
    </div>
  );
}

function KnowledgeSourceItem({ fragment }: { fragment: KnowledgeFragment }) {
  const [open, setOpen] = useState(false);
  const percent = Math.round(fragment.podobienstwo * 100);
  return (
    <li className="knowledge-source">
      <span className="knowledge-source-head">
        <span className="knowledge-title">📄 {fragment.tytul}</span>
        <span className="knowledge-similarity" title="Podobieństwo fragmentu do pytania">
          {percent}%
        </span>
        <button type="button" className="secondary knowledge-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Ukryj fragment" : "Pokaż fragment"}
        </button>
      </span>
      {open && <blockquote className="knowledge-fragment">{fragment.tresc}</blockquote>}
    </li>
  );
}

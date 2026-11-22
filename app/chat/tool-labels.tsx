import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { isGeneratedImageMessage } from "./messages";

export const TOOL_LABELS: Record<string, string> = {
  vision: "👁️ analiza zdjęcia",
  generowanieObrazu: "🎨 generowanie obrazu",
  generujObraz: "🎨 generowanie obrazu",
  wyszukajWInternecie: "🔎 wyszukiwanie",
  web_search: "🔎 wyszukiwanie",
  pogoda: "🌤️ pogoda",
  waluty: "💱 waluty",
  swieta: "🎉 święta",
  wikipedia: "📖 Wikipedia",
  kalkulator: "🧮 kalkulator",
  czas: "🕒 czas",
  strefaCzasowa: "🌍 strefa czasowa",
  przeliczCzas: "🌐 przeliczanie czasu",
  dniRobocze: "📅 dni robocze",
  firma: "🏢 firma",
  notatki: "📝 notatki",
  zapiszProfil: "🧠 zapiszProfil",
  searchKnowledge: "📚 baza wiedzy",
  diagnostyka: "🩺 diagnostyka",
  kursKrypto: "🦎🪙 kursKrypto",
  // Stare nazwy (lekcja 3) – dla rozmów sprzed zmiany.
  aktualnyCzas: "🕒 czas",
  kursWaluty: "💱 waluty",
};

// Etykiety użytych narzędzi nad odpowiedzią. Brak narzędzi = nic nie pokazujemy.
export function ToolLabels({ message, previous }: { message: UIMessage; previous?: UIMessage }) {
  if (message.role !== "assistant") return null;

  // Kroki agenta po kolei. Każdy krok modelu zaczyna się częścią "step-start";
  // w jednym kroku może być kilka narzędzi (wywołanych równolegle) – liczymy je (×2).
  // Krok bez narzędzi (np. samo „odpowiedz”, ukryte przez serwer) pomijamy.
  const steps: { name: string; count: number }[][] = [];
  const push = (name: string) => {
    if (steps.length === 0) steps.push([]);
    const current = steps[steps.length - 1];
    const same = current.find((t) => t.name === name);
    if (same) same.count++;
    else current.push({ name, count: 1 });
  };
  // Obraz wygenerowany przyciskiem „Wygeneruj obraz”.
  if (isGeneratedImageMessage(message)) push("generowanieObrazu");
  // Odpowiedź na wiadomość ze zdjęciem (Vision).
  else if (previous?.role === "user" && previous.parts.some((p) => p.type === "file")) push("vision");
  let sawSearch = false;
  for (const part of message.parts) {
    if (part.type === "step-start") steps.push([]);
    else if (isToolUIPart(part)) push(getToolName(part));
    // Wyszukiwanie OpenRoutera działa po stronie OpenRoutera — śladem są źródła (jedna etykieta na blok źródeł).
    else if (part.type === "source-url") {
      const hasSearchTool = message.parts.some(
        (p) => isToolUIPart(p) && getToolName(p) === "wyszukajWInternecie",
      );
      if (!hasSearchTool && !sawSearch) push("web_search");
      sawSearch = true;
    }
  }
  const used = steps.filter((tools) => tools.length > 0);
  if (used.length === 0) return null;

  return (
    <div className="tool-labels" aria-label="Kroki agenta po kolei">
      {used.map((tools, i) => (
        <span key={i} className="tool-step">
          {i > 0 && <span className="tool-arrow">→</span>}
          <span className="tool-label">
            {i + 1}.{" "}
            {tools
              .map(({ name, count }) => `${TOOL_LABELS[name] ?? `🛠 ${name}`}${count > 1 ? ` ×${count}` : ""}`)
              .join(" + ")}
          </span>
        </span>
      ))}
    </div>
  );
}

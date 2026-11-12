import { buildAnalysisPrompt, buildChatReply, parseAnalyzeRequest } from "./analysis";
import { runAnalysis } from "./analysis-run";
import { analyzeDocumentImage } from "./analyze-image-run";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "./images";
import { ANALYSIS_INSTRUCTIONS } from "./instructions";

// Tryb "analyze" endpointu /api/agent: wynik ustrukturyzowany (JSON), bez streamingu i bez narzędzi.
// - { message }: analiza wiadomości (category, priority, draft, needs_review) + reply (wspólne buildChatReply),
// - { image }:   analiza zdjęcia dokumentu (header + body, dwa kroki).
// Sesję sprawdza endpoint przed wywołaniem.

function fail(kind: string, message: string, status: number) {
  return Response.json({ ok: false, kind, message }, { status });
}

export async function handleAnalyze(body: unknown): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL;
  if (!apiKey || !modelId) {
    return fail("config", "Brak konfiguracji OPENROUTER_API_KEY lub OPENROUTER_MODEL w .env.local.", 500);
  }

  const image = (body as { image?: unknown } | null)?.image;

  // Zdjęcie dokumentu.
  if (image !== undefined) {
    const match = typeof image === "string" ? /^data:([^;]+);base64,(.+)$/.exec(image) : null;
    if (!match) return fail("input", "Dodaj zdjęcie do analizy.", 400);
    const [, mediaType, base64] = match;
    if (!IMAGE_TYPES.includes(mediaType)) {
      return fail("input", "Dozwolone są tylko zdjęcia JPG, PNG albo WEBP.", 400);
    }
    if (Math.floor((base64.length * 3) / 4) > IMAGE_MAX_BYTES) {
      return fail("input", "Zdjęcie jest za duże (maks. 4 MB).", 400);
    }
    const { status, ...rest } = await analyzeDocumentImage({
      apiKey,
      modelId,
      image: base64,
      mediaType,
      logTag: "api/agent analyze image",
    });
    return Response.json(rest, { status });
  }

  // Wiadomość tekstowa: tylko pole "message", inne pola są ignorowane.
  const input = parseAnalyzeRequest(body);
  if (!input.ok) return fail("input", input.message, 400);

  const { status, ...outcome } = await runAnalysis({
    apiKey,
    modelId,
    instructions: ANALYSIS_INSTRUCTIONS,
    prompt: buildAnalysisPrompt(input.message),
    logTag: "api/agent analyze",
  });
  if (outcome.ok && "analysis" in outcome) {
    // Tekst odpowiedzi budowany wspólnym kodem – tym samym co w trybie chat.
    return Response.json({ ...outcome, reply: buildChatReply(outcome.analysis) }, { status });
  }
  return Response.json(outcome, { status });
}

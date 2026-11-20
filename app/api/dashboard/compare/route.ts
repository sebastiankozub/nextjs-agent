import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { neutralizeDelimiters } from "../../../../lib/analysis";
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../../lib/auth";
import { TRAVEL_COMPARE_INSTRUCTIONS } from "../../../../lib/instructions";
import { describeProviderError, getOpenRouterConfig } from "../../../../lib/openrouter-config";
import {
  ensureCompareMissingMentioned,
  formatRecommendation,
  isValidDate,
  noDataCompareSummary,
  SOURCE_LABELS,
  TRAVEL_SOURCES,
  type TravelSource,
} from "../../../../lib/travel";

// Tryb „Porównaj”: agent poleca JEDNO z dwóch miast i uzasadnia to danymi z kart.
export const maxDuration = 30;

const card = z.union([
  z.object({
    ok: z.literal(true),
    value: z.string().max(300),
    details: z.array(z.string().max(500)).max(6),
    source: z.string().max(200),
  }),
  z.object({ ok: z.literal(false) }),
]);
const city = z.object({
  miasto: z.string().trim().min(2).max(80),
  karty: z.object(Object.fromEntries(TRAVEL_SOURCES.map((s) => [s, card])) as Record<TravelSource, typeof card>),
});
const bodySchema = z.object({ data: z.string().refine(isValidDate), miasta: z.tuple([city, city]) });

export async function POST(req: Request) {
  const authConfig = getAuthConfig();
  if (!authConfig || !isValidSessionToken(readSessionCookie(req), authConfig)) {
    return Response.json({ ok: false, message: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Nieprawidłowe dane kart." }, { status: 400 });
  const { data, miasta } = parsed.data;
  const [a, b] = miasta;
  if (a.miasto.toLowerCase() === b.miasto.toLowerCase()) {
    return Response.json({ ok: false, message: "Podaj dwa różne miasta." }, { status: 400 });
  }

  const cities = miasta.map((m) => ({ miasto: m.miasto, missing: TRAVEL_SOURCES.filter((s) => !m.karty[s].ok) }));
  const fetchedAt = new Date().toISOString();
  // Bez żadnych danych dla obu miast nie ma czego porównać – model nie jest wołany.
  if (cities.every((c) => c.missing.length === TRAVEL_SOURCES.length)) {
    return Response.json({ ok: true, text: noDataCompareSummary(a.miasto, b.miasto), polecam: null, fetchedAt });
  }

  const config = getOpenRouterConfig();
  if (!config.ok) return Response.json({ ok: false, message: config.message }, { status: 500 });

  const dane = miasta.map((m) => ({
    miasto: m.miasto,
    karty: TRAVEL_SOURCES.map((s) => {
      const k = m.karty[s];
      return k.ok
        ? { karta: SOURCE_LABELS[s], ok: true, wartosc: k.value, szczegoly: k.details }
        : { karta: SOURCE_LABELS[s], ok: false };
    }),
  }));
  const prompt = `Termin podróży: ${data}.\nDane kart obu miast:\n<<<\n${neutralizeDelimiters(JSON.stringify(dane, null, 2))}\n>>>`;
  // Schemat wymusza wybór JEDNEGO z dwóch miast (enum) – model nie może polecić „obu” ani trzeciego.
  const schema = z.object({
    polecam: z.enum([a.miasto, b.miasto]).describe("Polecane miasto – dokładnie jedno z dwóch"),
    uzasadnienie: z.string().min(20).max(800).describe("2–3 zdania z konkretnymi wartościami z kart"),
  });

  const openrouter = createOpenRouter({ apiKey: config.apiKey });
  try {
    const { output } = await generateText({
      model: openrouter.chat(config.modelId, {
        provider: { require_parameters: true },
        reasoning: { effort: "low", exclude: true },
      }),
      instructions: TRAVEL_COMPARE_INSTRUCTIONS,
      prompt,
      output: Output.object({ name: "travel_compare", description: "Rekomendacja jednego z dwóch miast", schema }),
      maxOutputTokens: 2000,
      abortSignal: AbortSignal.timeout(25_000),
    });
    const checked = schema.safeParse(output);
    if (!checked.success) throw new Error("Model zwrócił rekomendację w złym formacie.");
    const text = ensureCompareMissingMentioned(formatRecommendation(checked.data.polecam, checked.data.uzasadnienie), cities);
    return Response.json({ ok: true, text, polecam: checked.data.polecam, fetchedAt });
  } catch (error) {
    console.error("[api/dashboard/compare]", error);
    return Response.json(
      { ok: false, message: describeProviderError(error, "porównanie", config.modelId) },
      { status: 502 },
    );
  }
}

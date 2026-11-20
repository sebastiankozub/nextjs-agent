import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";
import { neutralizeDelimiters } from "../../../../lib/analysis";
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../../lib/auth";
import { TRAVEL_SUMMARY_INSTRUCTIONS } from "../../../../lib/instructions";
import { describeProviderError, getOpenRouterConfig } from "../../../../lib/openrouter-config";
import {
  ensureMissingMentioned,
  isValidDate,
  noDataSummary,
  SOURCE_LABELS,
  TRAVEL_SOURCES,
  type TravelSource,
} from "../../../../lib/travel";

// Podsumowanie agenta pod kartami: 2–3 zdania (co spakować, na co uważać) TYLKO z danych kart.
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

const bodySchema = z.object({
  miasto: z.string().trim().min(2).max(80),
  data: z.string().refine(isValidDate),
  karty: z.object(Object.fromEntries(TRAVEL_SOURCES.map((s) => [s, card])) as Record<TravelSource, typeof card>),
});

export async function POST(req: Request) {
  const authConfig = getAuthConfig();
  if (!authConfig || !isValidSessionToken(readSessionCookie(req), authConfig)) {
    return Response.json({ ok: false, message: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "Nieprawidłowe dane kart." }, { status: 400 });
  const { miasto, data, karty } = parsed.data;

  const missing = TRAVEL_SOURCES.filter((s) => !karty[s].ok);
  const fetchedAt = new Date().toISOString();
  // Bez żadnych danych model nie ma na czym się oprzeć – nie wołamy go (zero zmyślania).
  if (missing.length === TRAVEL_SOURCES.length) {
    return Response.json({ ok: true, text: noDataSummary(), missing, fetchedAt });
  }

  const config = getOpenRouterConfig();
  if (!config.ok) return Response.json({ ok: false, message: config.message }, { status: 500 });

  // Dane kart jako JSON między znacznikami <<< >>> (znaczniki w danych neutralizowane).
  const dane = TRAVEL_SOURCES.map((s) => {
    const k = karty[s];
    return k.ok
      ? { karta: SOURCE_LABELS[s], ok: true, wartosc: k.value, szczegoly: k.details, zrodlo: k.source }
      : { karta: SOURCE_LABELS[s], ok: false };
  });
  const prompt = `Podróż: ${neutralizeDelimiters(miasto)}, dzień: ${data}.\nDane kart:\n<<<\n${neutralizeDelimiters(JSON.stringify(dane, null, 2))}\n>>>`;

  try {
    const { text } = await generateText({
      model: createOpenRouter({ apiKey: config.apiKey })(config.modelId),
      instructions: TRAVEL_SUMMARY_INSTRUCTIONS,
      prompt,
      maxOutputTokens: 2000,
      abortSignal: AbortSignal.timeout(20_000),
    });
    if (!text.trim()) throw new Error("Pusta odpowiedź modelu.");
    // Serwer pilnuje, żeby podsumowanie mówiło wprost, których źródeł zabrakło.
    return Response.json({ ok: true, text: ensureMissingMentioned(text, missing), missing, fetchedAt });
  } catch (error) {
    console.error("[api/dashboard/summary]", error);
    return Response.json(
      { ok: false, message: describeProviderError(error, "podsumowanie", config.modelId) },
      { status: 502 },
    );
  }
}

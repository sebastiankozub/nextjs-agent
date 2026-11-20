import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";
import { fetchTravelCard } from "../../../lib/travel-sources";
import { isValidDate, TRAVEL_SOURCES, type TravelSource } from "../../../lib/travel";

// Asystent podróży: jedna karta = jedno zapytanie (GET ?zrodlo=pogoda&miasto=Lizbona&data=2026-12-01).
// Karty pobierane osobno – gdy jedno źródło nie odpowiada, pozostałe działają normalnie.
export const maxDuration = 30;

export async function GET(req: Request) {
  const authConfig = getAuthConfig();
  if (!authConfig || !isValidSessionToken(readSessionCookie(req), authConfig)) {
    return Response.json({ ok: false, message: "Brak dostępu. Zaloguj się hasłem." }, { status: 401 });
  }

  const url = new URL(req.url);
  const zrodlo = url.searchParams.get("zrodlo") ?? "";
  const miasto = (url.searchParams.get("miasto") ?? "").trim();
  const data = url.searchParams.get("data") ?? "";

  if (!TRAVEL_SOURCES.includes(zrodlo as TravelSource)) {
    return Response.json({ ok: false, message: "Nieznane źródło." }, { status: 400 });
  }
  if (miasto.length < 2 || miasto.length > 80) {
    return Response.json({ ok: false, message: "Podaj nazwę miasta (2–80 znaków)." }, { status: 400 });
  }
  if (!isValidDate(data)) {
    return Response.json({ ok: false, message: "Podaj datę w formacie RRRR-MM-DD." }, { status: 400 });
  }

  const card = await fetchTravelCard(zrodlo as TravelSource, miasto, data);
  return Response.json(card, { headers: { "cache-control": "no-store" } });
}

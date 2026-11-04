// Limit nieudanych prób logowania.
//
// UWAGA: licznik jest w pamięci JEDNEGO procesu Node.js.
// - Lokalnie (npm run dev / start) działa dobrze.
// - Na hostingu (np. Vercel, kilka instancji, restarty) NIE jest globalną
//   ochroną: każda instancja ma własny licznik i traci go po restarcie.
//   Tam włącz limit po stronie platformy (np. reguła rate limit w firewallu
//   hostingu) i ustaw długie, trudne hasło.
// Opóźnienie po błędnym haśle dodatkowo spowalnia zgadywanie.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
export const FAILURE_DELAY_MS = 1000;

const failures = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: Request): string {
  // Na hostingu za proxy adres jest w x-forwarded-for. Bez proxy ten nagłówek
  // może podać klient, więc to tylko ograniczenie "best effort".
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

function cleanup(now: number) {
  if (failures.size < 1000) return;
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key);
  }
}

export function isBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function registerFailure(key: string) {
  const now = Date.now();
  cleanup(now);
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(key: string) {
  failures.delete(key);
}

// Ochrona hasłem warsztatowym. Ten plik działa wyłącznie na serwerze.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "chat_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // sesja wygasa po 8 godzinach
const MIN_SECRET_LENGTH = 32;

type AuthConfig = { password: string; secret: string };

// Zwraca konfigurację albo null. Brak konfiguracji = brak dostępu (nigdy brak ochrony).
export function getAuthConfig(): AuthConfig | null {
  const password = process.env.CHAT_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  if (password === "" || secret.length < MIN_SECRET_LENGTH) return null;
  return { password, secret };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Porównanie hasła w stałym czasie (skróty mają zawsze tę samą długość).
export function checkPassword(input: string, config: AuthConfig): boolean {
  const hash = (value: string) =>
    createHmac("sha256", config.secret).update(value).digest();
  return timingSafeEqual(hash(input), hash(config.password));
}

// Token: v1.<czas wygaśnięcia>.<losowy identyfikator>.<podpis HMAC>
// Nie zawiera hasła.
export function createSessionToken(config: AuthConfig): string {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `v1.${expiresAt}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload, config.secret)}`;
}

export function isValidSessionToken(
  token: string | undefined,
  config: AuthConfig | null,
): boolean {
  if (!token || !config) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const payload = parts.slice(0, 3).join(".");
  if (!safeEqual(parts[3], sign(payload, config.secret))) return false;
  const expiresAt = Number(parts[1]);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

// Odczyt ciasteczka z nagłówka żądania (dla route handlerów).
export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const item of header.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

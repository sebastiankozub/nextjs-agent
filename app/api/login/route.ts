import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  createSessionToken,
  getAuthConfig,
  sessionCookieOptions,
} from "../../../lib/auth";
import {
  FAILURE_DELAY_MS,
  clearFailures,
  clientKey,
  isBlocked,
  registerFailure,
} from "../../../lib/rate-limit";

function redirectTo(location: string) {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(req: Request) {
  const config = getAuthConfig();
  if (!config) return redirectTo("/?blad=konfiguracja");

  const key = clientKey(req);
  if (isBlocked(key)) return redirectTo("/?blad=limit");

  let password = "";
  try {
    const form = await req.formData();
    password = String(form.get("password") ?? "");
  } catch {
    return redirectTo("/?blad=haslo");
  }

  if (!checkPassword(password, config)) {
    registerFailure(key);
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return redirectTo(isBlocked(key) ? "/?blad=limit" : "/?blad=haslo");
  }

  clearFailures(key);
  const response = redirectTo("/");
  response.cookies.set(SESSION_COOKIE, createSessionToken(config), {
    ...sessionCookieOptions,
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

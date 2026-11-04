import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "../../../lib/auth";

export async function POST() {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  // Usuwa ciasteczko sesji z przeglądarki.
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}

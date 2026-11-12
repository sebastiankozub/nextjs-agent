// PRZESTARZAŁE – zastąpione przez /api/agent (mode "chat"). Do usunięcia po testach.
import { handleChat } from "../../../lib/agent-chat";
import { getAuthConfig, isValidSessionToken, readSessionCookie } from "../../../lib/auth";

export const maxDuration = 90;

export async function POST(req: Request) {
  const authConfig = getAuthConfig();
  if (!authConfig || !isValidSessionToken(readSessionCookie(req), authConfig)) {
    return new Response("Brak dostępu.", { status: 401 });
  }
  return handleChat(await req.json().catch(() => null), authConfig);
}

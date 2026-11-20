import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, getAuthConfig, isValidSessionToken } from "../../lib/auth";
import TravelDashboard from "./travel-dashboard";

// Asystent podróży – tylko po zalogowaniu hasłem (bez sesji: powrót do strony logowania).
export default async function DashboardPage() {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!config || !isValidSessionToken(token, config)) redirect("/");
  return <TravelDashboard />;
}

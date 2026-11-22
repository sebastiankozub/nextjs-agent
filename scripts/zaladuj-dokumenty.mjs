// Wgrywa dokumenty Studio Nova do bazy wiedzy PRZEZ APLIKACJĘ (te same kroki co formularz /upload:
// sesja → dzielenie po akapitach → embeddingi → zapis). Dokument o tym samym tytule jest zastępowany.
//
// 1. W jednym terminalu: npm.cmd run dev
// 2. W drugim, w folderze projektu: node --env-file=.env.local scripts/zaladuj-dokumenty.mjs
//
// Hasło do logowania bierze z CHAT_PASSWORD w .env.local – nie wypisuje go.
import { readFile } from "node:fs/promises";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const DOCS = [
  { title: "Studio Nova – Cennik usług 2026", file: "docs/lekcja-06-dokumenty/cennik.txt" },
  { title: "Studio Nova – FAQ podróżnego", file: "docs/lekcja-06-dokumenty/faq.txt" },
  { title: "Studio Nova – Warunki uczestnictwa", file: "docs/lekcja-06-dokumenty/regulamin.txt" },
];
const STAGES = { split: "Dzielę tekst…", embed: "Tworzę embeddingi…", save: "Zapisuję…" };

if (!process.env.CHAT_PASSWORD) {
  console.error("Brak CHAT_PASSWORD – uruchom z --env-file=.env.local w folderze projektu.");
  process.exit(1);
}

// Logowanie jak w przeglądarce: formularz z hasłem → ciasteczko sesji.
let login;
try {
  login = await fetch(`${BASE}/api/login`, {
    method: "POST",
    body: new URLSearchParams({ password: process.env.CHAT_PASSWORD }),
    redirect: "manual",
  });
} catch {
  console.error(`Nie mogę połączyć się z ${BASE}. Czy działa npm.cmd run dev?`);
  process.exit(1);
}
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .find((c) => c.startsWith("chat_session="));
if (!cookie) {
  console.error(`Logowanie nie udało się (przekierowanie: ${login.headers.get("location") ?? "brak"}).`);
  process.exit(1);
}

for (const doc of DOCS) {
  const content = await readFile(doc.file, "utf8");
  console.log(`\n„${doc.title}” (${content.length} znaków)`);
  const res = await fetch(`${BASE}/api/knowledge`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title: doc.title, content, replace: true, method: "paragraphs" }),
  });
  if (!(res.headers.get("content-type") ?? "").includes("ndjson")) {
    const data = await res.json().catch(() => ({}));
    console.error(`  ✗ ${data.error ?? `HTTP ${res.status}`}`);
    process.exitCode = 1;
    continue;
  }
  for (const line of (await res.text()).split("\n").filter(Boolean)) {
    const ev = JSON.parse(line);
    if (ev.type === "stage") console.log(`  ${STAGES[ev.stage]}`);
    else if (ev.type === "done") {
      console.log(`  ✓ Zapisano: ${ev.chunkCount} fragmentów${ev.replaced ? " (zastąpiono poprzednią wersję)" : ""}`);
      for (const w of ev.warnings ?? []) console.log(`  ⚠ ${w}`);
    } else {
      console.error(`  ✗ Etap „${STAGES[ev.stage]}”: ${ev.error}\n    Co zrobić: ${ev.hint}`);
      process.exitCode = 1;
    }
  }
}
console.log("\nGotowe. Lista dokumentów: http://localhost:3000/upload");

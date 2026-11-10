// Testy walidacji analizy na danych lokalnych — bez wywoływania modelu.
// Uruchom: npm run test:analysis
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAnalysis, interpretModelOutput } from "../lib/analysis.ts";

const valid = {
  category: "sales",
  priority: "normal",
  draft: "Konsultacja online trwa 45 minut i kosztuje 150 zł brutto.",
  needs_review: false,
};

test("poprawny wynik przechodzi", () => {
  const r = validateAnalysis(valid);
  assert.equal(r.ok, true);
});

test("brak pola draft → odrzucone", () => {
  const { draft, ...noDraft } = valid;
  const r = validateAnalysis(noDraft);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "invalid_schema");
  assert.match(r.details.join(" "), /Brak wymaganego pola "draft"/);
});

test('needs_review jako tekst "false" → odrzucone', () => {
  const r = validateAnalysis({ ...valid, needs_review: "false" });
  assert.equal(r.ok, false);
  assert.match(r.details.join(" "), /"needs_review" ma zły typ/);
});

test("kategoria marketing → odrzucone", () => {
  const r = validateAnalysis({ ...valid, category: "marketing" });
  assert.equal(r.ok, false);
  assert.match(r.details.join(" "), /"category" ma niedozwoloną wartość "marketing"/);
});

test("dodatkowe pole send_now → odrzucone", () => {
  const r = validateAnalysis({ ...valid, send_now: true });
  assert.equal(r.ok, false);
  assert.match(r.details.join(" "), /dodatkowe pole: "send_now"/);
});

test("odmowa modelu (tekst zamiast JSON) → not_json", () => {
  const r = interpretModelOutput({
    finishReason: "stop",
    text: "Przepraszam, nie mogę pomóc w tej sprawie.",
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "not_json");
});

test("filtr treści dostawcy → refused", () => {
  const r = interpretModelOutput({ finishReason: "content-filter", text: "" });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "refused");
});

test("ucięta odpowiedź → truncated (nawet gdy początek wygląda dobrze)", () => {
  const r = interpretModelOutput({
    finishReason: "length",
    text: '{"category":"sales","priority":"nor',
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "truncated");
});

test("poprawny JSON, ale nietypowy powód zakończenia → nie jest sukcesem", () => {
  const r = interpretModelOutput({ finishReason: "other", text: JSON.stringify(valid) });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "incomplete");
});

test("HTTP 200 + pełny poprawny JSON i stop → sukces", () => {
  const r = interpretModelOutput({ finishReason: "stop", text: JSON.stringify(valid) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.analysis, valid);
});

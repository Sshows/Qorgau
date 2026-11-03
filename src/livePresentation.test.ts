import test from "node:test";
import assert from "node:assert/strict";
import { filterLiveEvents, groupLive, liveCsv } from "./livePresentation";
import type { LiveEvent } from "./liveData";
const e: LiveEvent = {
  id: "real-1",
  title: "Пожар",
  description: "Публикация источника",
  category: "Пожар",
  city: "Алматы",
  region: "Казахстан",
  latitude: null,
  longitude: null,
  occurredAt: null,
  publishedAt: "2026-11-02T11:00:00Z",
  checkedAt: "2026-11-03T12:00:00Z",
  sourceId: "mchs",
  sourceName: "МЧС",
  url: "https://www.gov.kz/test",
  verification: "Публикация",
  status: "recent",
};
test("live filters search multiple fields and combine category, scope and freshness", () => {
  assert.equal(
    filterLiveEvents([e], "мчс", "Пожар", "Алматы", "recent").length,
    1,
  );
  assert.equal(filterLiveEvents([e], "", "Пожар", "Астана").length, 0);
  assert.equal(filterLiveEvents([e], "", "", "all", "archive").length, 0);
  assert.deepEqual(groupLive([e, e], "sourceName"), [["МЧС", 2]]);
});
test("public export preserves unknown coordinates and times, escapes spreadsheet formulas", () => {
  const csv = liveCsv([{ ...e, title: '=HYPERLINK("bad")' }]);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(
    csv.includes('"";"2026-11-02T11:00:00Z";"2026-11-03T12:00:00Z";"";""'),
  );
  assert.ok(csv.includes("https://www.gov.kz/test"));
});

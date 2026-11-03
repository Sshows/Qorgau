import test from "node:test";
import assert from "node:assert/strict";

test("global event search includes district, category and source, with trimmed input", () => {
  const expected = demoEvents.filter(
    (e) => e.district === "Бостандыкский",
  ).length;
  assert.equal(
    filterEvents(demoEvents, { ...emptyFilters, query: " Бостандыкский " })
      .length,
    expected,
  );
  assert.ok(
    filterEvents(demoEvents, {
      ...emptyFilters,
      query: "Встроенный учебный сценарий",
    }).length > 0,
  );
});
import {
  demoEvents,
  validateEvent,
  filterEvents,
  emptyFilters,
  almatyDate,
  timeSeries,
  counts,
  eventsCsv,
  csvCell,
  validateCamera,
  seedCameras,
} from "./operations";
test("event validation rejects invalid coordinates, dates and roles, strips injected properties", () => {
  assert.throws(() => validateEvent({ ...demoEvents[0], latitude: NaN }));
  assert.throws(() => validateEvent({ ...demoEvents[0], latitude: 90 }));
  assert.throws(() =>
    validateEvent({ ...demoEvents[0], occurred_at: "2026-11-01" }),
  );
  assert.throws(() => validateEvent({ ...demoEvents[0], status: "admin" }));
  assert.throws(() => validateEvent({ ...demoEvents[0], is_demo: "false" }));
  assert.equal(
    "role" in validateEvent({ ...demoEvents[0], role: "admin" }),
    false,
  );
});
test("date filters use Almaty date and include both full endpoint days", () => {
  const a = { ...demoEvents[0], occurred_at: "2026-10-31T19:00:00Z" };
  const b = { ...a, id: "b", occurred_at: "2026-11-01T18:59:59Z" };
  const c = { ...a, id: "c", occurred_at: "2026-11-01T19:00:00Z" };
  assert.equal(almatyDate(a.occurred_at), "2026-11-01");
  assert.equal(
    filterEvents([a, b, c], {
      ...emptyFilters,
      from: "2026-11-01",
      to: "2026-11-01",
    }).length,
    2,
  );
  assert.equal(
    filterEvents(demoEvents, { ...emptyFilters, provenance: "registered" })
      .length,
    0,
  );
  assert.equal(
    filterEvents(demoEvents, {
      ...emptyFilters,
      category: "ДТП",
      district: "Бостандыкский",
    }).length,
    1,
  );
});
test("analytics counts actual records, fills empty days and groups Monday weeks", () => {
  assert.equal(
    counts(demoEvents, "district").reduce((sum, e) => sum + e[1], 0),
    5,
  );
  assert.deepEqual(
    timeSeries([
      { ...demoEvents[0], occurred_at: "2026-11-02T00:00:00Z" },
      { ...demoEvents[1], occurred_at: "2026-11-04T00:00:00Z" },
    ]),
    [
      ["2026-11-02", 1],
      ["2026-11-03", 0],
      ["2026-11-04", 1],
    ],
  );
  assert.deepEqual(
    timeSeries(
      [
        { ...demoEvents[0], occurred_at: "2026-11-02T00:00:00Z" },
        { ...demoEvents[1], occurred_at: "2026-11-08T00:00:00Z" },
      ],
      true,
    ),
    [["2026-11-02", 2]],
  );
});
test("CSV neutralizes formulas, quotes multiline text and preserves DEMO provenance", () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.match(csvCell(" \t@SUM(1)"), /^"'/);
  assert.ok(eventsCsv(demoEvents).startsWith("\ufeff"));
  assert.match(eventsCsv(demoEvents), /DEMO/);
});
test("cameras accept public direct HLS only and cannot be declared available by editing", () => {
  assert.equal(validateCamera(seedCameras[0]).latitude, null);
  assert.throws(() =>
    validateCamera({
      ...seedCameras[0],
      stream_url: "http://localhost/private.m3u8",
    }),
  );
  assert.throws(() =>
    validateCamera({
      ...seedCameras[0],
      stream_url: "https://example.com/page",
    }),
  );
  assert.throws(() =>
    validateCamera({ ...seedCameras[0], status: "Доступна" }),
  );
  assert.throws(() =>
    validateCamera({ ...seedCameras[0], latitude: 43.2, longitude: null }),
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildReportCsv, buildReportHtml } from "./reportExport";
import { demoEvents, emptyFilters } from "./operations";
import type { EventRecord } from "./operations";

const atStart: EventRecord = {
  ...demoEvents[0],
  id: "start",
  title: "Учебная запись на границе суток",
  district: "Алмалинский",
  occurred_at: "2026-11-01T19:00:00Z",
};
const atEnd: EventRecord = {
  ...atStart,
  id: "end",
  title: "Запись в конце дня",
  occurred_at: "2026-11-02T18:59:59Z",
  is_demo: false,
};
const excluded: EventRecord = {
  ...atStart,
  id: "outside",
  title: "Исключённая запись",
  occurred_at: "2026-11-02T19:00:00Z",
};
const filters = {
  ...emptyFilters,
  district: "Алмалинский",
  from: "2026-11-02",
  to: "2026-11-02",
};
const records = [atStart, atEnd, excluded];
const generatedAt = "2026-11-03T10:00:00Z";

test("report CSV exports only filtered local-date rows and requested columns, always with provenance", () => {
  const csv = buildReportCsv(records, filters, ["title", "occurred_at"]);
  assert.ok(csv.startsWith('\ufeff"Событие";"Дата · Алматы";"Происхождение"'));
  assert.equal(csv.split("\r\n").length, 3);
  assert.ok(csv.includes(atStart.title));
  assert.ok(csv.includes(atEnd.title));
  assert.ok(!csv.includes(excluded.title));
  assert.ok(!csv.includes('"Район"'));
  assert.ok(csv.includes('"DEMO"'));
  assert.ok(csv.includes('"Зарегистрировано"'));
});

test("custom CSV columns retain spreadsheet formula protection and quote escaping", () => {
  const dangerous = {
    ...atStart,
    title: ' =HYPERLINK("https://invalid.example")',
    source: 'Line one\n"Line two"',
  };
  const csv = buildReportCsv([dangerous], emptyFilters, ["title", "source"]);
  assert.ok(csv.includes('"\' =HYPERLINK(""https://invalid.example"")"'));
  assert.ok(csv.includes('"Line one\n""Line two"""'));
  assert.ok(csv.endsWith(';"DEMO"'));
});

test("HTML report applies identical filters, selected sections and columns", () => {
  const html = buildReportHtml({
    events: records,
    filters,
    columns: ["title"],
    metrics: ["statuses", "table"],
    title: "Контрольная сводка",
    generatedAt,
  });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<h2>Статусы</h2>"));
  assert.ok(html.includes("<h2>События</h2>"));
  assert.ok(!html.includes("<h2>Категории</h2>"));
  assert.ok(!html.includes("<h2>Динамика</h2>"));
  assert.ok(!html.includes("<th>Район</th>"));
  assert.ok(html.includes(atStart.title));
  assert.ok(html.includes(atEnd.title));
  assert.ok(!html.includes(excluded.title));
  assert.ok(html.includes("Содержит DEMO: 1"));
  assert.ok(html.includes("<th>Происхождение</th>"));
  assert.ok(html.includes("Отобрано 2 из 3 записей"));
});

test("HTML report escapes untrusted titles, source text and metadata and needs no remote scripts", () => {
  const malicious = {
    ...atStart,
    title: '<img src=x onerror="alert(1)">',
    source: "</td><script>alert(1)</script>",
  };
  const html = buildReportHtml({
    events: [malicious],
    filters: emptyFilters,
    columns: ["title", "source"],
    metrics: ["table"],
    title: "</title><script>bad()</script>",
    generatedAt,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img "));
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes("&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("&lt;/title&gt;&lt;script&gt;bad()&lt;/script&gt;"));
  assert.ok(!html.includes("<link "));
});

test("DEMO disclosure cannot be disabled by excluding tables, empty selections remain exportable, invalid ranges fail", () => {
  const html = buildReportHtml({
    events: [atStart],
    filters: emptyFilters,
    columns: ["title"],
    metrics: [],
    title: "Только сводка",
    generatedAt,
  });
  assert.ok(html.includes("Содержит DEMO: 1"));
  assert.ok(!html.includes("<table>"));
  const empty = buildReportCsv(
    records,
    { ...filters, query: "Ничего не найдено" },
    ["title"],
  );
  assert.equal(empty.split("\r\n").length, 1);
  assert.ok(empty.includes('"Происхождение"'));
  assert.throws(
    () =>
      buildReportCsv(records, { ...filters, from: "2026-11-03" }, ["title"]),
    /Начало периода/,
  );
  assert.throws(() => buildReportCsv(records, filters, []), /столбец/);
});

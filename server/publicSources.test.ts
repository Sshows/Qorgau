import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublicDataService,
  fetchPublicText,
  parseGovRss,
  parseKndc,
  parseTelegram,
  parseUsgs,
  plainText,
} from "./publicSources.js";
import {
  eventHasCoordinates,
  isRecentEvent,
  liveEventDate,
} from "../src/liveData.js";

const now = Date.parse("2026-11-03T15:00:00Z");
const occurred = now - 3_600_000;
function measurement(overrides: Record<string, unknown> = {}) {
  return {
    id: "known123",
    type: "Feature",
    properties: {
      type: "earthquake",
      time: occurred,
      mag: 3.2,
      place: "Almaty region",
      status: "reviewed",
      url: "https://earthquake.usgs.gov/earthquakes/eventpage/known123",
      ...overrides,
    },
    geometry: { type: "Point", coordinates: [76.9, 43.25, 10] },
  };
}
function rss(items: string) {
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}
function rssItem(
  title = "В Алматы перекроют участок улицы",
  pubDate = "Tue, 03 Nov 2026 12:00:00 GMT",
) {
  return `<item><title>${title}</title><description>&lt;p&gt;Официальное сообщение об ограничении.&lt;/p&gt;</description><link>https://www.gov.kz/memleket/entities/almaty/press/news/details/123?lang=ru</link><pubDate>${pubDate}</pubDate></item>`;
}
function telegram(
  title = "В Алматы ликвидирован пожар",
  time = "2026-11-03T11:00:00+00:00",
) {
  return `<div class="tgme_widget_message" data-post="dchs_alm/123"><div class="tgme_widget_message_text js-message_text" dir="auto">${title}</div><a href="https://t.me/dchs_alm/123"><time datetime="${time}">11:00</time></a></div>`;
}
function response(body: unknown, contentType = "application/json") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: { "Content-Type": contentType },
  });
}

test("USGS keeps source occurrence time, precise coordinates and no fabricated publication time", () => {
  const events = parseUsgs(
    { type: "FeatureCollection", features: [measurement()] },
    now,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].occurredAt, new Date(occurred).toISOString());
  assert.equal(events[0].publishedAt, null);
  assert.equal(events[0].checkedAt, new Date(now).toISOString());
  assert.equal(events[0].status, "recent");
  assert.equal(eventHasCoordinates(events[0]), true);
  assert.match(events[0].verification, /Не подтверждает последствия/);
});

test("USGS excludes foreign, future, stale, invalid coordinates and untrusted links", () => {
  const invalidGeometry = {
    ...measurement(),
    geometry: { type: "Point", coordinates: [999, null] },
  };
  const distant = {
    ...measurement(),
    geometry: { type: "Point", coordinates: [0, 0] },
  };
  const events = parseUsgs(
    {
      type: "FeatureCollection",
      features: [
        invalidGeometry,
        distant,
        measurement({ time: now + 3_600_000 }),
        measurement({ time: now - 31 * 86_400_000 }),
        measurement({ url: "https://example.com/fake" }),
      ],
    },
    now,
  );
  assert.equal(events.length, 0);
  assert.throws(() => parseUsgs({ earthquakes: [] }, now), /Структура/);
});

test("historical instrument readings stay archived even when fetched now", () => {
  const event = parseUsgs(
    {
      type: "FeatureCollection",
      features: [measurement({ time: now - 5 * 86_400_000 })],
    },
    now,
  )[0];
  assert.equal(event.status, "archive");
  assert.equal(isRecentEvent(event, now), false);
  assert.equal(liveEventDate(event), event.occurredAt);
});

test("KNDC accepts real epoch seconds, rejects missing values, retains preliminary attribution", () => {
  const item = {
    id: "123",
    epochtime: String(occurred / 1000),
    lat: "43.25",
    lon: "76.9",
    mb: "3.5",
    gregion: "LAKE ISSYK-KUL REGION",
  };
  const events = parseKndc(
    {
      ok: true,
      data: {
        events: [
          item,
          { ...item, id: "124", lat: "" },
          { ...item, id: "125", epochtime: "not-a-date" },
        ],
      },
    },
    now,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].occurredAt, new Date(occurred).toISOString());
  assert.equal(events[0].publishedAt, null);
  assert.match(events[0].verification, /предварительные/);
});

test("government RSS exposes publication, never invents event time or coordinates", () => {
  const events = parseGovRss(rss(rssItem()), now, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceId, "almaty-akimat");
  assert.equal(events[0].city, "Алматы");
  assert.equal(events[0].latitude, null);
  assert.equal(events[0].longitude, null);
  assert.equal(events[0].occurredAt, null);
  assert.equal(events[0].publishedAt, "2026-11-03T12:00:00.000Z");
  assert.equal(events[0].category, "Дорожное ограничение");
  assert.match(events[0].verification, /планируемое/);
});

test("RSS filters sporting/new-station publicity, future and old reports; advice remains a publication", () => {
  const result = parseGovRss(
    rss(
      rssItem("Чемпионат по пожарно-спасательному спорту") +
        rssItem("В Казахстане открылась пожарная часть") +
        rssItem("Ликвидирован пожар", "Tue, 03 Nov 2026 23:00:00 GMT") +
        rssItem("Ликвидирован пожар", "Tue, 01 Sep 2026 12:00:00 GMT") +
        rssItem("Пожар на кухне: что делать?"),
    ),
    now,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].category, "Публикация о пожаре");
  assert.throws(() => parseGovRss("<html>Access denied</html>", now), /RSS/);
});

test("Telegram publication is not recast as active incident or geocoded from the channel name", () => {
  const result = parseTelegram(telegram(), now);
  assert.equal(result.length, 1);
  assert.match(result[0].title, /ликвидирован/);
  assert.equal(result[0].occurredAt, null);
  assert.equal(result[0].latitude, null);
  assert.equal(result[0].city, "Алматы");
  assert.equal(result[0].url, "https://t.me/dchs_alm/123");
  assert.match(result[0].verification, /пересланным/);
  assert.equal(
    parseTelegram(telegram("Прошёл турнир пожарных"), now).length,
    0,
  );
  assert.throws(() => parseTelegram("<html>Login</html>", now), /недоступна/);
});

test("Kazakh publication place wording uses Unicode boundaries, not the channel location", () => {
  const located = parseTelegram(
    telegram("Алматыда өрт сөндірушілер өртті сөндірді"),
    now,
  )[0];
  assert.equal(located.city, "Алматы");
  assert.equal(located.category, "Публикация о пожаре");
  assert.equal(located.latitude, null);
  assert.equal(located.occurredAt, null);
  assert.equal(
    parseTelegram(telegram("Талдықорғанда өрт сөндірілді"), now)[0].city,
    "",
  );
  assert.equal(
    parseTelegram(telegram("Алматы облысында өрт сөндірілді"), now)[0].city,
    "",
  );
  assert.equal(parseTelegram(telegram("Пожар ликвидирован"), now)[0].city, "");
});

test("markup and encoded scripts are plain text only", () => {
  assert.equal(
    plainText(
      "&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;Пожар &amp; дым&lt;/p&gt;",
    ),
    "Пожар & дым",
  );
});

test("allowlist rejects arbitrary proxy targets before fetch", async () => {
  let requested = false;
  const fetcher: typeof fetch = async () => {
    requested = true;
    return response({});
  };
  await assert.rejects(
    fetchPublicText(fetcher, "https://example.com/arbitrary", "json"),
    /не разрешён/,
  );
  await assert.rejects(
    fetchPublicText(fetcher, "https://www.gov.kz/private", "json"),
    /не разрешён/,
  );
  assert.equal(requested, false);
});

test("bounded reader rejects oversized/changing content and wrong formats", async () => {
  const fetcher: typeof fetch = async () => response("x".repeat(1_500_001));
  await assert.rejects(
    fetchPublicText(fetcher, "https://osirisai.live/api/earthquakes", "json"),
    /размер/,
  );
  await assert.rejects(
    fetchPublicText(
      async () => response("denied", "text/html"),
      "https://osirisai.live/api/earthquakes",
      "json",
    ),
    /тип ответа/,
  );
});

test("5-minute cache and in-flight deduplication limit upstream requests", async () => {
  let requests = 0;
  let clock = now;
  const fetcher: typeof fetch = async (input) => {
    requests++;
    const u = new URL(String(input));
    if (u.hostname === "t.me") return response(telegram(), "text/html");
    if (u.hostname === "www.gov.kz")
      return response(rss(rssItem()), "application/rss+xml");
    if (u.hostname === "kndc.kz")
      return response({ ok: true, data: { events: [] } });
    if (u.hostname === "osirisai.live") return response({ earthquakes: [] });
    return response({ type: "FeatureCollection", features: [] });
  };
  const service = createPublicDataService(
    fetcher,
    () => clock,
    () => undefined,
  );
  const [first, shared] = await Promise.all([service(), service()]);
  assert.equal(requests, 6);
  assert.equal(first.cached, false);
  assert.equal(shared.cached, true);
  assert.equal((await service()).cached, true);
  assert.equal(requests, 6);
  clock += 300_001;
  await service();
  assert.equal(requests, 12);
});

test("failed refresh retains last successful dates, marks source unavailable and ages records", async () => {
  let clock = now;
  let failing = false;
  const fetcher: typeof fetch = async (input) => {
    if (failing) throw new Error("Network unavailable");
    const u = new URL(String(input));
    if (u.hostname === "t.me")
      return response(
        telegram("Пожар ликвидирован", "2026-10-31T15:04:00Z"),
        "text/html",
      );
    if (u.hostname === "www.gov.kz")
      return response(rss(""), "application/rss+xml");
    if (u.hostname === "kndc.kz")
      return response({ ok: true, data: { events: [] } });
    if (u.hostname === "osirisai.live") return response({ earthquakes: [] });
    return response({ type: "FeatureCollection", features: [] });
  };
  const service = createPublicDataService(
    fetcher,
    () => clock,
    () => undefined,
  );
  const first = await service();
  assert.equal(first.events[0].status, "recent");
  clock += 300_001;
  failing = true;
  const next = await service();
  assert.equal(next.sources[0].status, "error");
  assert.equal(next.sources[0].lastSuccessAt, first.sources[0].lastSuccessAt);
  assert.equal(next.events[0].checkedAt, first.events[0].checkedAt);
  assert.equal(next.events[0].publishedAt, first.events[0].publishedAt);
  assert.equal(next.events[0].status, "archive");
  clock += 86_400_000;
  assert.equal((await service()).events.length, 0);
});

test("OSIRIS USGS relay duplicates do not inflate event counts", async () => {
  const fetcher: typeof fetch = async (input) => {
    const u = new URL(String(input));
    if (u.hostname === "t.me")
      return response(telegram("Обычный пост"), "text/html");
    if (u.hostname === "www.gov.kz")
      return response(rss(""), "application/rss+xml");
    if (u.hostname === "kndc.kz")
      return response({ ok: true, data: { events: [] } });
    if (u.hostname === "osirisai.live")
      return response({
        earthquakes: [
          {
            id: "known123",
            lat: 43.25,
            lng: 76.9,
            magnitude: 3.2,
            place: "Almaty region",
            time: occurred,
            type: "earthquake",
            url: "https://earthquake.usgs.gov/earthquakes/eventpage/known123",
          },
        ],
      });
    return response({ type: "FeatureCollection", features: [measurement()] });
  };
  const result = await createPublicDataService(
    fetcher,
    () => now,
    () => undefined,
  )();
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].sourceId, "usgs");
  assert.equal(result.sources.find((s) => s.id === "osiris")?.eventCount, 0);
});

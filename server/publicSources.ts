import {
  isRecentEvent,
  liveEventDate,
  PUBLIC_REFRESH_SECONDS,
} from "../src/liveData.js";
import type {
  LiveDataSnapshot,
  LiveEvent,
  SourceState,
} from "../src/liveData.js";

const DAY = 86_400_000;
const MAX_AGE = 30 * DAY;
const MAX_BYTES = 1_500_000;
const MAX_EVENTS = 150;
const ALMATY = { latitude: 43.238949, longitude: 76.889709 };
type Fetcher = typeof fetch;
type SourceDefinition = {
  id: string;
  name: string;
  url: string;
  note: string;
  load: (fetcher: Fetcher, now: number) => Promise<LiveEvent[]>;
};
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Неверная структура ответа источника");
  return value as JsonObject;
}
function text(value: unknown, max = 500): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}
function number(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function coordinate(value: unknown, max: number): number | null {
  const result = number(value);
  return result !== null && Math.abs(result) <= max ? result : null;
}
function date(value: unknown, now: number): string | null {
  const epoch =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : NaN;
  return Number.isFinite(epoch) &&
    epoch >= now - MAX_AGE &&
    epoch <= now + 300_000
    ? new Date(epoch).toISOString()
    : null;
}
function safeUrl(value: unknown, allowedHosts: string[]): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      allowedHosts.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function distanceFromAlmaty(
  latitude: number,
  longitude: number,
): number {
  const radians = Math.PI / 180;
  const dLat = (latitude - ALMATY.latitude) * radians;
  const dLon = (longitude - ALMATY.longitude) * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(ALMATY.latitude * radians) *
      Math.cos(latitude * radians) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function event(fields: Omit<LiveEvent, "status">, now: number): LiveEvent {
  const result: LiveEvent = { ...fields, status: "archive" };
  result.status = isRecentEvent(result, now) ? "recent" : "archive";
  return result;
}

// Fixed, reviewed upstream paths only. Never proxy a URL supplied by a caller.
const allowedPaths = new Map([
  ["t.me", ["/s/dchs_alm"]],
  [
    "www.gov.kz",
    ["/api/v1/public/rss/emer/news/ru", "/api/v1/public/rss/almaty/news/ru"],
  ],
  ["kndc.kz", ["/modules/mod_kndcbul_alarm/ajax.php"]],
  ["earthquake.usgs.gov", ["/fdsnws/event/1/query"]],
  ["osirisai.live", ["/api/earthquakes"]],
]);
export async function fetchPublicText(
  fetcher: Fetcher,
  address: string,
  kind: "json" | "xml" | "html",
): Promise<string> {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    !allowedPaths.get(url.hostname)?.includes(url.pathname) ||
    url.username ||
    url.password
  )
    throw new Error("Источник не разрешён");
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(7_500),
    redirect: "error",
    headers: {
      Accept:
        kind === "json"
          ? "application/json"
          : kind === "xml"
            ? "application/rss+xml, application/xml, text/xml"
            : "text/html",
      "User-Agent": "QORGAU-Public-Monitor/1.0",
    },
  });
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !new RegExp(
      kind === "json" ? "json" : kind === "xml" ? "xml" : "html",
      "i",
    ).test(contentType)
  )
    throw new Error("Неожиданный тип ответа источника");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES)
    throw new Error("Ответ источника превышает допустимый размер");
  if (!response.body) throw new Error("Пустой ответ источника");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BYTES)
        throw new Error("Ответ источника превышает допустимый размер");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseUsgs(
  payload: unknown,
  now: number,
  relay = false,
): LiveEvent[] {
  const root = object(payload);
  const rows = relay ? root.earthquakes : root.features;
  if (!Array.isArray(rows) || (!relay && root.type !== "FeatureCollection"))
    throw new Error("Структура сейсмического источника изменилась");
  const result: LiveEvent[] = [];
  for (const raw of rows.slice(0, 500)) {
    try {
      const item = object(raw);
      const properties = relay ? item : object(item.properties);
      const geometry = relay ? null : object(item.geometry);
      const coords = geometry?.coordinates;
      if (!relay && (geometry?.type !== "Point" || !Array.isArray(coords)))
        continue;
      const latitude = coordinate(
        relay ? item.lat : (coords as unknown[])[1],
        90,
      );
      const longitude = coordinate(
        relay ? item.lng : (coords as unknown[])[0],
        180,
      );
      const occurredAt = date(properties.time, now);
      const url = safeUrl(properties.url, ["earthquake.usgs.gov"]);
      const id = text(item.id, 100);
      const mag = number(relay ? item.magnitude : properties.mag);
      if (
        latitude === null ||
        longitude === null ||
        !occurredAt ||
        !url ||
        !id ||
        properties.type !== "earthquake" ||
        distanceFromAlmaty(latitude, longitude) > 100
      )
        continue;
      result.push(
        event(
          {
            id: `usgs-${id}`,
            title: `Землетрясение${mag === null ? "" : ` M ${mag.toFixed(1)}`} · ${text(properties.place, 150) || "район Алматы"}`,
            description: `Эпицентр в ${Math.round(distanceFromAlmaty(latitude, longitude))} км от центра Алматы. Инструментальная регистрация USGS; наличие ущерба или ощущаемость в городе этим источником не устанавливаются.`,
            category: "Землетрясение",
            city: "Алматы и окрестности",
            region: "Радиус 100 км от Алматы",
            latitude,
            longitude,
            occurredAt,
            publishedAt: null,
            checkedAt: new Date(now).toISOString(),
            sourceId: relay ? "osiris" : "usgs",
            sourceName: relay ? "OSIRIS · данные USGS" : "USGS",
            url,
            verification: `Инструментальная регистрация USGS${!relay && properties.status === "reviewed" ? "; параметры просмотрены специалистом" : "; параметры могут уточняться"}. Не подтверждает последствия.`,
          },
          now,
        ),
      );
    } catch {
      /* One malformed upstream entry must not discard valid measurements. */
    }
  }
  return result;
}

export function parseKndc(payload: unknown, now: number): LiveEvent[] {
  const root = object(payload);
  const data = object(root.data);
  if (root.ok !== true || !Array.isArray(data.events))
    throw new Error("Структура бюллетеня КНДЦ изменилась");
  const result: LiveEvent[] = [];
  for (const raw of data.events.slice(0, 100)) {
    try {
      const item = object(raw);
      const latitude = coordinate(item.lat, 90);
      const longitude = coordinate(item.lon, 180);
      const epoch = number(item.epochtime);
      const occurredAt = date(epoch === null ? null : epoch * 1000, now);
      const id = text(item.id, 50);
      const region = text(item.gregion, 150);
      const inKazakhstan = /^KAZAKHSTAN$/i.test(region);
      if (
        latitude === null ||
        longitude === null ||
        !occurredAt ||
        !/^\d+$/.test(id) ||
        (!inKazakhstan && distanceFromAlmaty(latitude, longitude) > 100)
      )
        continue;
      const magnitude = number(item.mb);
      result.push(
        event(
          {
            id: `kndc-${id}`,
            title: `Сейсмическое событие${magnitude !== null && magnitude > -10 ? ` Mb ${magnitude.toFixed(1)}` : ""} · ${region || "район Алматы"}`,
            description:
              text(item.evdescrip) ||
              `Предварительные параметры срочного донесения КНДЦ. Расстояние до центра Алматы: ${Math.round(distanceFromAlmaty(latitude, longitude))} км. Последствия и ощущаемость не установлены этим бюллетенем.`,
            category: "Сейсмическое событие",
            city:
              distanceFromAlmaty(latitude, longitude) <= 100
                ? "Алматы и окрестности"
                : "",
            region,
            latitude,
            longitude,
            occurredAt,
            publishedAt: null,
            checkedAt: new Date(now).toISOString(),
            sourceId: "kndc",
            sourceName: "КНДЦ · срочные донесения",
            url: "https://kndc.kz/index.php/ru/sejsmicheskie-byulleteni/alarm-bulletin",
            verification:
              "Официальные предварительные параметры КНДЦ; могут уточняться. Время события UTC, время публикации не предоставлено.",
          },
          now,
        ),
      );
    } catch {
      /* Ignore invalid entries, never invent replacement values. */
    }
  }
  return result;
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code: string) => {
      const n = code.toLowerCase().startsWith("x")
        ? parseInt(code.slice(1), 16)
        : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp);/g,
      (_match, code: string) =>
        ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[
          code
        ] ?? "",
    );
}
export function plainText(value: string, limit = 650): string {
  // Decode twice for XML-escaped HTML. Strip markup AFTER decoding; UI only receives plain text.
  return text(
    decodeEntities(decodeEntities(value))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " "),
    limit,
  );
}
function categoryFor(title: string): string {
  if (/перекр|огранич.*движ|движ.*огранич|жол.*жаб/i.test(title))
    return "Дорожное ограничение";
  if (/землетряс|сейсм|жер сілкін/i.test(title)) return "Землетрясение";
  if (/павод|подтоп|сел[ьи]|тасқын/i.test(title)) return "Природные явления";
  if (/пожар|возгоран|өрт/iu.test(title)) return "Публикация о пожаре";
  // Published safety advice and incident reports remain clearly classified as publications.
  return "Официальная публикация";
}
function publicationCity(value: string): string {
  // Explicit place wording in the publication, not a location inferred from the channel.
  // JavaScript \b does not delimit Cyrillic words; use Unicode letter boundaries.
  return /(?:^|[^\p{L}])(?:Алматыда|Алматыдағы|Алматы\s+қалас[\p{L}]*|в\s+(?:городе\s+)?Алматы)(?=$|[^\p{L}])/iu.test(
    value,
  )
    ? "Алматы"
    : "";
}
function relevant(title: string): boolean {
  return (
    !/спорт|чемпион|турнир|наград|поздрав|совещан|встреч[аи]|посетил|экскурс|учени[ея]|учебн|открыл|открыт|обсудил|рассмотрен|как стал|создани[ея].*баз|взаимодейств/i.test(
      title,
    ) &&
    /пожар|возгоран|өрт|чрезвыч|землетряс|сейсм|павод|подтоп|эваку|перекр|огранич.*движ|движ.*огранич|дтп|авари|шторм|спас[её]|селев|снегопад|угроз|предупрежд|тасқын|төтенше/i.test(
      title,
    )
  );
}
function xmlTag(item: string, tag: string): string {
  return (
    item.match(
      new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"),
    )?.[1] ?? ""
  );
}
export function parseGovRss(
  xml: string,
  now: number,
  municipality = false,
): LiveEvent[] {
  if (!/<rss\b/i.test(xml) || !/<channel\b/i.test(xml))
    throw new Error("Вместо RSS получен другой документ");
  const result: LiveEvent[] = [];
  const sourceId = municipality ? "almaty-akimat" : "emer";
  for (const match of [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
  ].slice(0, 100)) {
    const item = match[1];
    const title = plainText(xmlTag(item, "title"), 220);
    const publishedAt = date(
      decodeEntities(xmlTag(item, "pubDate")).trim(),
      now,
    );
    const url = safeUrl(decodeEntities(xmlTag(item, "link")).trim(), [
      "www.gov.kz",
    ]);
    if (!title || !publishedAt || !url || !relevant(title)) continue;
    const description = plainText(xmlTag(item, "description"));
    result.push(
      event(
        {
          id: `${sourceId}-${new URL(url).pathname.split("/").at(-1)}`,
          title,
          description:
            description || "Полный текст доступен в официальной публикации.",
          category: categoryFor(title),
          city: municipality
            ? "Алматы"
            : publicationCity(`${title} ${description}`),
          region: municipality ? "Алматы" : "Казахстан",
          latitude: null,
          longitude: null,
          occurredAt: null,
          publishedAt,
          checkedAt: new Date(now).toISOString(),
          sourceId,
          sourceName: municipality
            ? "Акимат Алматы · официальный RSS"
            : "МЧС Казахстана · официальный RSS",
          url,
          verification:
            "Официальная публикация. Координаты и время самого события не установлены; сообщение может описывать профилактику, завершённое или планируемое событие.",
        },
        now,
      ),
    );
  }
  return result;
}
export function parseTelegram(html: string, now: number): LiveEvent[] {
  if (!html.includes("tgme_widget_message") || !html.includes("dchs_alm"))
    throw new Error(
      "Публичная лента Telegram недоступна или её формат изменился",
    );
  const posts = html.split(/(?=<div\b[^>]*\bdata-post="dchs_alm\/\d+")/);
  const result: LiveEvent[] = [];
  for (const part of posts.slice(-40)) {
    const id = part.match(/\bdata-post="dchs_alm\/(\d+)"/)?.[1];
    const raw = part.match(
      /<div\b[^>]*class="[^"]*tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];
    const publication = part.match(/<time\b[^>]*datetime="([^"]+)"/)?.[1];
    const publishedAt = date(publication, now);
    if (!id || !raw || !publishedAt) continue;
    const description = plainText(raw);
    if (!relevant(description)) continue;
    result.push(
      event(
        {
          id: `dchs-${id}`,
          title: description.slice(0, 160),
          description,
          category: categoryFor(description.slice(0, 200)),
          city: publicationCity(description),
          region: "",
          latitude: null,
          longitude: null,
          occurredAt: null,
          publishedAt,
          checkedAt: new Date(now).toISOString(),
          sourceId: "dchs-almaty",
          sourceName: "ДЧС Алматы · публичный канал",
          url: `https://t.me/dchs_alm/${id}`,
          verification:
            "Публикация публичного канала ДЧС Алматы. Может быть пересланным сообщением; место, координаты и время события не установлены. Не подтверждает действующее происшествие.",
        },
        now,
      ),
    );
  }
  return result;
}

const sources: SourceDefinition[] = [
  {
    id: "dchs-almaty",
    name: "ДЧС Алматы · Telegram",
    url: "https://t.me/dchs_alm",
    note: "Публичная HTML-лента Telegram без входа. Публикации с тематикой происшествий; без вымышленных координат. Машинный API канала не предоставлен, формат ленты может измениться.",
    load: async (fetcher, now) =>
      parseTelegram(
        await fetchPublicText(fetcher, "https://t.me/s/dchs_alm", "html"),
        now,
      ),
  },
  {
    id: "emer",
    name: "МЧС Казахстана",
    url: "https://www.gov.kz/org/emer?lang=ru",
    note: "Официальный RSS, опубликованный на сайте МЧС. Новости и предупреждения за 30 дней; публикация не означает действующее происшествие.",
    load: async (fetcher, now) =>
      parseGovRss(
        await fetchPublicText(
          fetcher,
          "https://www.gov.kz/api/v1/public/rss/emer/news/ru",
          "xml",
        ),
        now,
      ),
  },
  {
    id: "almaty-akimat",
    name: "Акимат Алматы · городские сообщения",
    url: "https://www.gov.kz/memleket/entities/almaty?lang=ru",
    note: "Официальный RSS акимата: дорожные ограничения, предупреждения и городские события за 30 дней. Время публикации отделено от времени ограничения.",
    load: async (fetcher, now) =>
      parseGovRss(
        await fetchPublicText(
          fetcher,
          "https://www.gov.kz/api/v1/public/rss/almaty/news/ru",
          "xml",
        ),
        now,
        true,
      ),
  },
  {
    id: "kndc",
    name: "КНДЦ · бюллетень срочных донесений",
    url: "https://kndc.kz/index.php/ru/sejsmicheskie-byulleteni/alarm-bulletin",
    note: "Тот же публичный JSON, который загружает виджет официального бюллетеня. Последние 20 записей: до 100 км от Алматы либо регион KAZAKHSTAN; не полный каталог. Предварительные параметры, время UTC.",
    load: async (fetcher, now) =>
      parseKndc(
        JSON.parse(
          await fetchPublicText(
            fetcher,
            "https://kndc.kz/modules/mod_kndcbul_alarm/ajax.php?module_id=109&action=events&page=1",
            "json",
          ),
        ),
        now,
      ),
  },
  {
    id: "usgs",
    name: "USGS · землетрясения",
    url: "https://earthquake.usgs.gov/fdsnws/event/1/",
    note: "Публичный GeoJSON USGS: радиус 100 км от Алматы, последние 30 дней, до 100 записей. Инструментальное событие не устанавливает последствия в городе.",
    load: async (fetcher, now) => {
      const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
      url.search = new URLSearchParams({
        format: "geojson",
        latitude: String(ALMATY.latitude),
        longitude: String(ALMATY.longitude),
        maxradiuskm: "100",
        starttime: new Date(now - MAX_AGE).toISOString(),
        endtime: new Date(now).toISOString(),
        limit: "100",
        orderby: "time",
      }).toString();
      return parseUsgs(
        JSON.parse(await fetchPublicText(fetcher, url.href, "json")),
        now,
      );
    },
  },
  {
    id: "osiris",
    name: "OSIRIS · публичный сейсмический слой",
    url: "https://osirisai.live/docs",
    note: "Документированный публичный API OSIRIS, слой USGS. Только реальные эпицентры в 100 км от Алматы; дубликаты прямого USGS исключаются. Глобальные политические новости с условными координатами не становятся городскими происшествиями.",
    load: async (fetcher, now) =>
      parseUsgs(
        JSON.parse(
          await fetchPublicText(
            fetcher,
            "https://osirisai.live/api/earthquakes",
            "json",
          ),
        ),
        now,
        true,
      ),
  },
];

/** Factory allows deterministic parser/cache/failure tests without making network requests. */
export function createPublicDataService(
  fetcher: Fetcher = fetch,
  clock = Date.now,
  logger: (id: string, reason: string) => void = (id, reason) =>
    console.warn(`[public-data:${id}] ${reason}`),
) {
  let cached: LiveDataSnapshot | null = null;
  let expires = 0;
  let inFlight: Promise<LiveDataSnapshot> | null = null;
  return async function getData(): Promise<LiveDataSnapshot> {
    const now = clock();
    if (cached && now < expires) return { ...cached, cached: true };
    if (inFlight) return { ...(await inFlight), cached: true };
    inFlight = (async () => {
      const checkedAt = new Date(now).toISOString();
      const results = await Promise.all(
        sources.map(async (source) => {
          const previous = cached?.sources.find((s) => s.id === source.id);
          try {
            const records = await source.load(fetcher, now);
            return {
              records,
              state: {
                id: source.id,
                name: source.name,
                url: source.url,
                status: "ok",
                checkedAt,
                lastSuccessAt: checkedAt,
                error: null,
                eventCount: records.length,
                note: source.note,
                refreshSeconds: PUBLIC_REFRESH_SECONDS,
              } satisfies SourceState,
            };
          } catch (error) {
            const reason =
              error instanceof Error && error.name === "TimeoutError"
                ? "Превышено время ожидания источника"
                : error instanceof Error
                  ? error.message.slice(0, 180)
                  : "Источник недоступен";
            logger(source.id, reason);
            // Keep source dates and retrieval dates from the last success; never turn a failed fetch into a new incident.
            const records = (cached?.events ?? [])
              .filter(
                (e) =>
                  e.sourceId === source.id &&
                  now - Date.parse(e.checkedAt) <= DAY,
              )
              .map((e) => ({
                ...e,
                status: isRecentEvent(e, now)
                  ? ("recent" as const)
                  : ("archive" as const),
              }));
            return {
              records,
              state: {
                id: source.id,
                name: source.name,
                url: source.url,
                status: "error",
                checkedAt,
                lastSuccessAt: previous?.lastSuccessAt ?? null,
                error: reason,
                eventCount: records.length,
                note: `${source.note}${records.length ? " Показан последний успешный снимок, источник сейчас недоступен." : ""}`,
                refreshSeconds: PUBLIC_REFRESH_SECONDS,
              } satisfies SourceState,
            };
          }
        }),
      );
      const seen = new Set<string>();
      // Direct USGS precedes relay in definitions. Link-based de-duplication preserves provenance.
      const events = results
        .flatMap((r) => r.records)
        .filter((e) => {
          const key =
            e.sourceId === "dchs-almaty"
              ? `${e.sourceId}:${e.title}:${e.publishedAt}`
              : e.url ===
                  "https://kndc.kz/index.php/ru/sejsmicheskie-byulleteni/alarm-bulletin"
                ? e.id
                : e.url;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort(
          (a, b) =>
            Date.parse(liveEventDate(b) ?? "") -
            Date.parse(liveEventDate(a) ?? ""),
        )
        .slice(0, MAX_EVENTS);
      const states = results.map((r) => ({
        ...r.state,
        eventCount: events.filter((e) => e.sourceId === r.state.id).length,
      }));
      cached = {
        events,
        sources: states,
        generatedAt: checkedAt,
        refreshSeconds: PUBLIC_REFRESH_SECONDS,
        cached: false,
      };
      expires = now + PUBLIC_REFRESH_SECONDS * 1000;
      return cached;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };
}

export const getPublicData = createPublicDataService();

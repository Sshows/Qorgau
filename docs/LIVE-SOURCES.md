# Public incident sources

Audit and live fetch: 2026-11-03, 15:18 UTC. These are public publications and instrumental measurements, **not a police incident register or confirmation that an incident is ongoing**. Counts change with the feeds.

| Source | Public retrieval method | Observed status / normalized records | Important limit |
| --- | --- | --- | --- |
| [DChS Almaty](https://t.me/dchs_alm) | Public [Telegram channel preview](https://t.me/s/dchs_alm), without login | HTTP 200 / 9 distinct relevant publications | HTML preview is not a documented machine API and can change. Forwarded posts are possible. No coordinates or occurrence time inferred from channel name. |
| [MChS Kazakhstan](https://www.gov.kz/org/emer?lang=ru) | [Official RSS](https://www.gov.kz/api/v1/public/rss/emer/news/ru), linked by the ministry website | HTTP 200 / 4 relevant publications | Advice and completed incidents remain publications. RSS pubDate is publication time, not occurrence time. |
| [Almaty Akimat](https://www.gov.kz/memleket/entities/almaty?lang=ru) | [Official RSS](https://www.gov.kz/api/v1/public/rss/almaty/news/ru) | HTTP 200 / 4 road-restriction publications | Dates of planned restrictions are not inferred from publication dates. Addresses in prose do not become invented coordinates. |
| [KNDC urgent bulletin](https://kndc.kz/index.php/ru/sejsmicheskie-byulleteni/alarm-bulletin) | [Public JSON](https://kndc.kz/modules/mod_kndcbul_alarm/ajax.php?module_id=109&action=events&page=1), exactly the endpoint called by the bulletin's [public widget script](https://kndc.kz/modules/mod_kndcbul_alarm/assets/js/mod_kndcbul_alarm.js?v=1.0.2) | HTTP 200 / 0 qualifying measurements | Most recent 20 bulletin records, not a full historical catalogue. Keep points within 100 km of Almaty or explicitly labelled KAZAKHSTAN, at most 30 days old. Official bulletin states parameters are preliminary; epoch is occurrence time, UTC. No separately published third-party API guarantee. |
| [USGS event service](https://earthquake.usgs.gov/fdsnws/event/1/) | Public documented GeoJSON query | HTTP 200 / 0 qualifying measurements | Fixed 100 km radius around Almaty, last 30 days, at most 100 entries. Instrumental earthquake does not establish local damage. `time` is occurrence time; `updated` is not used as publication time. |
| [OSIRIS public API](https://osirisai.live/docs) | Documented [earthquake layer](https://osirisai.live/api/earthquakes), no key | HTTP 200 / 0 qualifying measurements | Public USGS relay, same 100 km filter; duplicate USGS original URLs removed. OSIRIS news country anchors are not precise incident coordinates and are not imported as Almaty incidents. |

Observed snapshot: **17 distinct publications; 13 published in the last 72 hours; zero qualifying measurements with coordinates**. This means there were no qualifying mapped measurements in these bounded responses, not that no incident occurred in the city. Recent examples include DChS fire-extinguishing reports and the Akimat's publication about a temporary closure on Brusilovsky Street. Their original URLs remain in every record.

## Data contract and operation

`GET /api/index?route=public-data` does not require a database session or API key. It returns `LiveDataSnapshot` from `src/liveData.ts`: `events`, per-source `sources`, `generatedAt`, `refreshSeconds`, and `cached`.

- `occurredAt` is only filled from structured source occurrence time. `publishedAt` is separate. `checkedAt` is successful retrieval time for each record. Missing coordinates are both `null`, and missing location remains an empty string. Explicit Russian/Kazakh city wording such as “в Алматы” or “Алматыда” supplies the city label, never coordinates. Mentioning Almaty region does not establish that the event was in the city.
- `recent` means its source occurrence/publication timestamp is at most 72 hours old. It never means an operational incident is currently active. Older records are explicitly `archive`; entries older than 30 days and dates over five minutes in the future are excluded.
- Refresh/cache TTL: 300 seconds, server module cache plus request deduplication and shared CDN cache headers. This is bounded caching, not a durable database or globally coordinated scheduler. Serverless cold starts can create another bounded upstream fetch.
- Upstream safeguards: fixed HTTPS host/path allowlist, no URL accepted from API callers, no redirects, 10-second timeout, content-type check, maximum 1.5 MB per response, bounded entry counts and normalized plain text. No raw upstream HTML enters the client.
- On failure the source is marked `error`; `checkedAt` records the failed attempt and `lastSuccessAt` remains unchanged. At most 24 hours of the previous successful snapshot is retained with its original record timestamps. Failures are logged with source ID and bounded reason; no invented fallback incidents are generated.
- UI automatic refresh should use `refreshSeconds`. Public-data cache headers use `s-maxage=300` and `stale-while-revalidate=60`.
- No private Telegram API, source credentials, copied keys, or restricted endpoint is used. Public preview access does not imply a contractual availability or reuse guarantee; RSS and original links are preferred when supplied by a source.

## Verification

`server/publicSources.test.ts` checks source date separation, invalid/future/stale measurements, coordinate bounds, preliminary KNDC provenance, publication-only RSS/Telegram records, explicit Kazakh/Russian city wording with Unicode boundaries, rejection of irrelevant sporting/station-opening stories, HTML normalization, the upstream allowlist and size/content limits, five-minute caching, concurrent request deduplication, failed-source stale snapshots, and USGS relay deduplication. All 14 tests passed at this audit.

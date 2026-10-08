import providers from "./profileProviders.json";
import type { MapObject } from "./data";
import { isWithinAlmaty } from "./domain";

export type ProfileStatus =
  | "found"
  | "missing"
  | "unverified"
  | "unavailable"
  | "incompatible";
export interface ProfileResult {
  provider: string;
  url: string | null;
  status: ProfileStatus;
  note: string;
}

export function normalizeHandle(input: string) {
  const handle = input.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(handle)) {
    throw new Error(
      "Введите один известный ник: латинские буквы, цифры, точка, дефис или подчёркивание. Ссылки, телефоны и email не принимаются.",
    );
  }
  if (/^[\d.+()-]+$/.test(handle))
    throw new Error(
      "Здесь нужен ник аккаунта. Проверка номера находится во вкладке «Телефон».",
    );
  return handle;
}

export function profileLinks(input: string): ProfileResult[] {
  const handle = normalizeHandle(input);
  return Object.entries(providers).map(([provider, config]) => {
    const compatible =
      (!config.regexCheck || new RegExp(config.regexCheck).test(handle)) &&
      (provider !== "Telegram" || /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(handle));
    return {
      provider,
      url: compatible
        ? config.url.replace("{}", encodeURIComponent(handle))
        : null,
      status: compatible ? "unverified" : "incompatible",
      note: compatible
        ? "Ссылка по нику. Наличие профиля не проверено."
        : "Ник не подходит для формата этой площадки.",
    };
  });
}

// Exactly one public API request. No profile fields, cross-account identity joins or recursion.
export async function checkGithub(
  input: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<ProfileResult> {
  const handle = normalizeHandle(input);
  const initial = profileLinks(handle)[0];
  if (initial.status === "incompatible") return initial;
  const response = await request(
    `https://api.github.com/users/${encodeURIComponent(handle)}`,
    {
      signal,
      credentials: "omit",
      headers: { Accept: "application/vnd.github+json" },
      referrerPolicy: "no-referrer",
    },
  );
  if (response.status === 404)
    return {
      ...initial,
      status: "missing",
      note: "Публичный API GitHub не нашёл этот ник.",
    };
  if (!response.ok)
    return {
      ...initial,
      status: "unavailable",
      note: "GitHub недоступен или ограничил запросы. Это не означает отсутствие аккаунта.",
    };
  const data = await response.json();
  if (
    typeof data.login !== "string" ||
    data.login.toLowerCase() !== handle.toLowerCase() ||
    !["User", "Organization"].includes(data.type) ||
    data.html_url?.toLowerCase() !==
      `https://github.com/${handle.toLowerCase()}`
  ) {
    return {
      ...initial,
      status: "unavailable",
      note: "Ответ источника не подтвердил точное совпадение ника.",
    };
  }
  return {
    ...initial,
    url: data.html_url,
    status: "found",
    note:
      data.type === "Organization"
        ? "GitHub подтвердил публичный аккаунт организации с этим ником."
        : "GitHub подтвердил публичный аккаунт с этим ником. Личность владельца не установлена.",
  };
}

export function parsePlaces(payload: unknown): MapObject[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("features" in payload) ||
    !Array.isArray(payload.features)
  )
    return [];
  const result: MapObject[] = [];
  const seen = new Set<string>();
  for (const feature of payload.features.slice(0, 20)) {
    const p = feature?.properties,
      coordinates = feature?.geometry?.coordinates;
    if (
      feature?.geometry?.type !== "Point" ||
      !Array.isArray(coordinates) ||
      !p
    )
      continue;
    const [longitude, latitude] = coordinates;
    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      !isWithinAlmaty({ longitude, latitude })
    )
      continue;
    const types: Record<string, string> = {
      N: "node",
      W: "way",
      R: "relation",
    };
    const osmType = types[p.osm_type];
    if (!osmType || !/^\d{1,16}$/.test(String(p.osm_id))) continue;
    const id = `photon-${osmType}-${p.osm_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const field = (value: unknown) =>
      typeof value === "string" ? value.slice(0, 160) : "";
    const address = [field(p.street), field(p.housenumber), field(p.city)]
      .filter(Boolean)
      .join(", ");
    result.push({
      id,
      name: field(p.name) || address || "Объект OpenStreetMap",
      kind: "place",
      longitude,
      latitude,
      district: "Алматы и окрестности",
      description:
        "Публичный объект или адрес из OpenStreetMap. Результаты могут быть неполными или устаревшими.",
      address,
      isDemo: false,
      provider: "Photon / OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/${osmType}/${p.osm_id}`,
    });
  }
  return result.slice(0, 7);
}

const placeCache = new Map<string, MapObject[]>();
let lastPlaceRequest = 0;
export async function searchPlaces(
  input: string,
  signal: AbortSignal,
): Promise<MapObject[]> {
  const query = input.trim();
  if (query.length < 3 || query.length > 120)
    throw new Error(
      "Введите название организации или адрес: от 3 до 120 символов.",
    );
  const key = query.toLocaleLowerCase("ru");
  const cached = placeCache.get(key);
  if (cached) return cached;
  if (Date.now() - lastPlaceRequest < 2000)
    throw new Error("Подождите две секунды перед следующим запросом.");
  lastPlaceRequest = Date.now();
  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({
    q: query,
    limit: "7",
    bbox: "76.5,42.8,77.3,43.6",
    lon: "76.935",
    lat: "43.252",
  }).toString();
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new Error(
      "Поиск адресов временно недоступен. Попробуйте позже или откройте 2ГИС.",
    );
  const places = parsePlaces(await response.json());
  if (placeCache.size >= 20) placeCache.delete(placeCache.keys().next().value!);
  placeCache.set(key, places);
  return places;
}

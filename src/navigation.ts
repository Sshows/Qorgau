export const pageIds = [
  "overview",
  "map",
  "events",
  "cameras",
  "analytics",
  "reports",
  "ai",
  "settings",
  "lab",
] as const;
export type Page = (typeof pageIds)[number];
export function parseRoute(hash: string) {
  const [path, search = ""] = hash.replace(/^#/, "").split("?");
  const [page, entity] = path.split("/");
  let decodedEntity = entity || "";
  try {
    decodedEntity = decodeURIComponent(decodedEntity);
  } catch {
    decodedEntity = "";
  }
  return {
    page: pageIds.includes(page as Page)
      ? (page as Page)
      : ("overview" as Page),
    entity: decodedEntity,
    params: new URLSearchParams(search),
  };
}
export function filterRouteValues(
  params: URLSearchParams,
  base: Record<string, string>,
) {
  return Object.fromEntries(
    [...params].filter(([key]) => Object.hasOwn(base, key)),
  );
}
export function routeHash(
  page: Page,
  values: Record<string, string> = {},
  entity = "",
) {
  const params = new URLSearchParams(
    Object.entries(values).filter(([, v]) => v !== ""),
  );
  return `#${page}${entity ? `/${encodeURIComponent(entity)}` : ""}${params.size ? `?${params}` : ""}`;
}
export function loadSession<T>(key: string, fallback: T): T {
  try {
    const value = sessionStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

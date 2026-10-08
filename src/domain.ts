import { objectAliases, objects, patrols, type MapObject } from "./data";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// A navigation envelope around Almaty, not the legal city boundary.
export const almatyBounds = {
  minLongitude: 76.5,
  maxLongitude: 77.3,
  minLatitude: 42.8,
  maxLatitude: 43.6,
} as const;

export function isWithinAlmaty({ latitude, longitude }: Coordinates): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= almatyBounds.minLatitude &&
    latitude <= almatyBounds.maxLatitude &&
    longitude >= almatyBounds.minLongitude &&
    longitude <= almatyBounds.maxLongitude
  );
}

/** Parse latitude, longitude. Decimal comma is supported when separated by a semicolon or spaces. */
export function parseCoordinates(input: string): Coordinates | null {
  const value = input
    .trim()
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^\[(.*)\]$/, "$1")
    .trim();
  const decimal = "[+-]?\\d+(?:[.,]\\d+)?";
  const dotDecimal = "[+-]?\\d+(?:\\.\\d+)?";
  const match =
    value.match(new RegExp(`^(${decimal})\\s*;\\s*(${decimal})$`)) ??
    value.match(new RegExp(`^(${decimal})\\s+(${decimal})$`)) ??
    value.match(new RegExp(`^(${dotDecimal})\\s*,\\s*(${dotDecimal})$`));

  if (!match) return null;
  const coordinates = {
    latitude: Number(match[1].replace(",", ".")),
    longitude: Number(match[2].replace(",", ".")),
  };
  return isWithinAlmaty(coordinates) ? coordinates : null;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Search the bundled local catalog; returned items retain their original references. */
export function searchLocal(input: string): MapObject[] {
  const query = normalizeSearch(input);
  if (!query) return [];
  const words = query.split(/\s+/);

  return objects
    .map((object, index) => {
      const name = normalizeSearch(object.name);
      const aliases = (objectAliases[object.id] ?? []).map(normalizeSearch);
      const haystack = normalizeSearch(
        [
          object.name,
          object.id,
          `${object.district} район`,
          object.address ?? "",
          object.description,
          object.isDemo ? "демо demo учебный" : "",
          ...(objectAliases[object.id] ?? []),
        ].join(" "),
      );
      const matches = words.every((word) => haystack.includes(word));
      const rank =
        name === query || aliases.includes(query)
          ? 0
          : name.startsWith(query)
            ? 1
            : name.includes(query)
              ? 2
              : 3;
      return { object, index, matches, rank };
    })
    .filter((result) => result.matches)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((result) => result.object);
}

/** Great-circle distance in kilometres; this is not a road route or a travel-time estimate. */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    6371.0088 *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
  );
}

export interface NearestPatrol {
  patrol: MapObject;
  distanceKm: number;
}

/** Select the closest patrol from the caller's candidate list; status filtering is explicit in the UI. */
export function nearestPatrol(
  target: Coordinates,
  candidates: MapObject[] = patrols,
): NearestPatrol | null {
  if (!isWithinAlmaty(target)) return null;
  let result: NearestPatrol | null = null;
  for (const patrol of candidates) {
    if (patrol.kind !== "patrol" || !isWithinAlmaty(patrol)) continue;
    const distance = distanceKm(target, patrol);
    if (!result || distance < result.distanceKm)
      result = { patrol, distanceKm: distance };
  }
  return result;
}

/** Public source records are publications/measurements, not operator-confirmed incidents. */
export interface LiveEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  city: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string | null;
  publishedAt: string | null;
  checkedAt: string;
  sourceId: string;
  sourceName: string;
  url: string;
  verification: string;
  status: "recent" | "archive";
}

export interface SourceState {
  id: string;
  name: string;
  url: string;
  status: "ok" | "error" | "external";
  checkedAt: string;
  lastSuccessAt: string | null;
  error: string | null;
  eventCount: number;
  note: string;
  refreshSeconds: number;
}

export interface LiveDataSnapshot {
  events: LiveEvent[];
  sources: SourceState[];
  generatedAt: string;
  refreshSeconds: number;
  cached: boolean;
}

export const PUBLIC_REFRESH_SECONDS = 300;
export const RECENT_EVENT_HOURS = 72;

/** Prefer occurrence time. Publication time does not establish when the incident occurred. */
export function liveEventDate(event: LiveEvent): string | null {
  return event.occurredAt ?? event.publishedAt;
}

export function isRecentEvent(event: LiveEvent, now = Date.now()): boolean {
  const value = liveEventDate(event);
  if (!value) return false;
  const age = now - Date.parse(value);
  return (
    Number.isFinite(age) &&
    age >= -300_000 &&
    age <= RECENT_EVENT_HOURS * 3_600_000
  );
}

export function eventHasCoordinates(
  event: LiveEvent,
): event is LiveEvent & { latitude: number; longitude: number } {
  return (
    typeof event.latitude === "number" &&
    Number.isFinite(event.latitude) &&
    event.latitude >= -90 &&
    event.latitude <= 90 &&
    typeof event.longitude === "number" &&
    Number.isFinite(event.longitude) &&
    event.longitude >= -180 &&
    event.longitude <= 180
  );
}

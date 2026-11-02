import { lazy, Suspense, useMemo, useState } from "react";
import { city, districts, landmarks } from "./data";
import type { MapObject } from "./data";
import { publicWebcams } from "./publicSources";
import { toMapEvent } from "./operations";
import type { EventRecord, CameraRecord } from "./operations";
import { searchPlaces } from "./publicSearch";
import { parseCoordinates } from "./domain";
const MapView = lazy(() => import("./MapView"));
export default function OperationsMap({
  events,
  cameras,
  onPick,
  compact = false,
  district = "",
}: {
  events: EventRecord[];
  cameras: CameraRecord[];
  onPick?: (latitude: number, longitude: number) => void;
  compact?: boolean;
  district?: string;
}) {
  const [three, setThree] = useState(false),
    [buildings, setBuildings] = useState(false),
    [roads, setRoads] = useState(false),
    [basemap, setBasemap] = useState<"streets" | "satellite">("streets");
  const [layers, setLayers] = useState(["incident", "webcam", "place"]),
    [selected, setSelected] = useState<MapObject | null>(null),
    [status, setStatus] = useState("Загрузка карты…");
  const [focus, setFocus] = useState<{
      latitude: number;
      longitude: number;
      height: number;
      nonce: number;
    } | null>({ ...city, height: 16000, nonce: 0 }),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<MapObject[]>([]),
    [searching, setSearching] = useState(false),
    [message, setMessage] = useState("");
  const objects = useMemo(
    () => [
      ...events.map(toMapEvent),
      ...landmarks.filter((l) => !district || l.district === district),
      ...cameras
        .filter(
          (c) =>
            c.latitude !== null &&
            c.longitude !== null &&
            (!district || c.district === district),
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
          kind: "webcam" as const,
          latitude: c.latitude!,
          longitude: c.longitude!,
          district: c.district,
          description: c.location_note,
          isDemo: c.is_demo,
          status: c.status,
        })),
      ...((!district || district === "Медеуский") &&
      cameras.some((c) => c.source_url === "https://shymbulak.com/live/")
        ? publicWebcams
        : []),
    ],
    [events, cameras, district],
  );
  function fly(point: { latitude: number; longitude: number }, height = 3500) {
    setFocus({ ...point, height, nonce: Date.now() });
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setSearching(true);
    try {
      const coords = parseCoordinates(query);
      if (coords) {
        fly(coords);
        onPick?.(coords.latitude, coords.longitude);
        return;
      }
      const local = objects.filter((o) =>
        o.name.toLowerCase().includes(query.toLowerCase()),
      );
      if (local.length) {
        setResults(local.slice(0, 7));
        return;
      }
      const found = await searchPlaces(query, new AbortController().signal);
      setResults(found);
      if (!found.length) setMessage("Объекты не найдены. Уточните адрес.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Поиск недоступен");
    } finally {
      setSearching(false);
    }
  }
  return (
    <section className={`op-map ${compact ? "compact" : ""}`}>
      <div className="op-map-tools">
        <button onClick={() => setThree(!three)}>{three ? "3D" : "2D"}</button>
        <button
          onClick={() =>
            setBasemap((b) => (b === "streets" ? "satellite" : "streets"))
          }
        >
          {basemap === "streets" ? "Спутник" : "Улицы"}
        </button>
        <button
          onClick={() =>
            fly(districts.find((d) => d.name === district) ?? city, 16000)
          }
        >
          К городу
        </button>
        {!compact && (
          <>
            <label>
              <input
                type="checkbox"
                checked={buildings}
                onChange={(e) => setBuildings(e.target.checked)}
              />
              Здания OSM
            </label>
            <label>
              <input
                type="checkbox"
                checked={roads}
                onChange={(e) => setRoads(e.target.checked)}
              />
              Дороги
            </label>
          </>
        )}
        {[
          ["incident", "События"],
          ["webcam", "Камеры"],
          ["place", "Объекты"],
        ].map(([kind, label]) => (
          <label key={kind}>
            <input
              type="checkbox"
              checked={layers.includes(kind)}
              onChange={() =>
                setLayers((l) =>
                  l.includes(kind) ? l.filter((x) => x !== kind) : [...l, kind],
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {!compact && (
        <form className="op-map-search" onSubmit={search}>
          <input
            aria-label="Адрес или координаты"
            placeholder="Адрес, объект или 43.238, 76.945"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            minLength={3}
          />
          <button disabled={searching}>Найти</button>
          <span>{message}</span>
          {results.length > 0 && (
            <div className="op-search-results">
              {results.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => {
                    setSelected(r);
                    fly(r);
                    setResults([]);
                    onPick?.(r.latitude, r.longitude);
                  }}
                >
                  {r.name} · {r.address}
                </button>
              ))}
            </div>
          )}
        </form>
      )}
      <div className="op-map-canvas">
        <Suspense
          fallback={<div className="op-skeleton">Загрузка карты Алматы…</div>}
        >
          <MapView
            objects={objects}
            visibleKinds={layers}
            selected={selected}
            focus={focus}
            basemap={basemap}
            is3D={three}
            buildings={buildings}
            roads={roads}
            route={null}
            onSelect={(o) => {
              setSelected(o);
              if (onPick) onPick(o.latitude, o.longitude);
            }}
            onStatus={setStatus}
            onCoordinate={onPick}
          />
        </Suspense>
        {selected && (
          <div className="op-map-card">
            <button
              className="op-close"
              onClick={() => setSelected(null)}
              aria-label="Закрыть карточку"
            >
              ×
            </button>
            <span className="op-tag">
              {selected.isDemo ? "DEMO" : "Источник: каталог"}
            </span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <small>
              {selected.district} · {selected.latitude.toFixed(5)},{" "}
              {selected.longitude.toFixed(5)}
            </small>
          </div>
        )}
      </div>
      <div className="op-map-foot">
        <span>{status}</span>
        <span>
          {onPick
            ? "Нажмите на карту для выбора места"
            : "Точки районов и ориентиры не являются официальными границами"}
        </span>
      </div>
    </section>
  );
}

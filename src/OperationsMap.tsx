import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronRight,
  Crosshair,
  Layers3,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { city, districts, landmarks } from "./data";
import type { MapObject } from "./data";
import { publicWebcams } from "./publicSources";
import { toMapEvent } from "./operations";
import type { EventRecord, CameraRecord } from "./operations";
import { searchPlaces } from "./publicSearch";
import { parseCoordinates } from "./domain";
import "./map-workspace.css";

const MapView = lazy(() => import("./MapView"));
export interface OperationsMapProps {
  events: EventRecord[];
  cameras: CameraRecord[];
  onPick?: (latitude: number, longitude: number) => void;
  compact?: boolean;
  district?: string;
  onDistrictChange?: (district: string) => void;
  onEventSelect?: (event: EventRecord) => void;
  onCameraSelect?: (camera: CameraRecord) => void;
  selectedCameraId?: string;
  focusPoint?: { latitude: number; longitude: number; nonce?: number };
}
export default function OperationsMap({
  events,
  cameras,
  onPick,
  compact = false,
  district = "",
  onDistrictChange,
  onEventSelect,
  onCameraSelect,
  selectedCameraId,
  focusPoint,
}: OperationsMapProps) {
  const [three, setThree] = useState(false),
    [buildings, setBuildings] = useState(false),
    [roads, setRoads] = useState(false);
  const [basemap, setBasemap] = useState<"streets" | "satellite">("satellite");
  const [layers, setLayers] = useState(["incident", "webcam", "place"]),
    [selected, setSelected] = useState<MapObject | null>(null),
    [status, setStatus] = useState("Загрузка карты…");
  const [activeDistrict, setActiveDistrict] = useState(district),
    [showDistricts, setShowDistricts] = useState(false);
  const [focus, setFocus] = useState({ ...city, height: 22000, nonce: 0 });
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<MapObject[]>([]),
    [searching, setSearching] = useState(false),
    [message, setMessage] = useState("");
  const searchRequest = useRef<AbortController | null>(null);
  const visibleEvents = useMemo(
    () =>
      events.filter((e) => !activeDistrict || e.district === activeDistrict),
    [events, activeDistrict],
  );
  const visibleCameras = useMemo(
    () =>
      cameras.filter((c) => !activeDistrict || c.district === activeDistrict),
    [cameras, activeDistrict],
  );
  const objects = useMemo<MapObject[]>(
    () => [
      ...visibleEvents.map(toMapEvent),
      ...landmarks.filter(
        (l) => !activeDistrict || l.district === activeDistrict,
      ),
      ...visibleCameras
        .filter((c) => c.latitude !== null && c.longitude !== null)
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
          address: c.address,
          sourceUrl: c.source_url,
        })),
      ...(visibleCameras.some(
        (c) =>
          c.source_url === "https://shymbulak.com/live/" && c.latitude === null,
      )
        ? publicWebcams
        : []),
    ],
    [visibleEvents, visibleCameras, activeDistrict],
  );
  function fly(point: { latitude: number; longitude: number }, height = 5500) {
    setFocus({ ...point, height, nonce: Date.now() });
  }
  useEffect(() => {
    setActiveDistrict(district);
    const p = districts.find((d) => d.name === district);
    setFocus({ ...(p ?? city), height: p?.height ?? 22000, nonce: Date.now() });
    setSelected(null);
  }, [district]);
  useEffect(() => {
    if (focusPoint)
      setFocus({
        ...focusPoint,
        height: 4500,
        nonce: focusPoint.nonce ?? Date.now(),
      });
  }, [focusPoint?.latitude, focusPoint?.longitude, focusPoint?.nonce]);
  useEffect(() => {
    if (!selectedCameraId) return;
    const camera = cameras.find((c) => c.id === selectedCameraId);
    const point =
      objects.find((o) => o.id === selectedCameraId) ??
      (camera?.latitude === null &&
      camera.source_url === "https://shymbulak.com/live/"
        ? objects.find((o) => o.id === "webcam-shymbulak")
        : undefined);
    if (point) {
      setSelected(point);
      fly(point);
    }
  }, [selectedCameraId, objects, cameras]);
  useEffect(() => () => searchRequest.current?.abort(), []);
  function chooseDistrict(value: string) {
    setActiveDistrict(value);
    onDistrictChange?.(value);
    const p = districts.find((d) => d.name === value);
    fly(p ?? city, p?.height ?? 22000);
    setSelected(null);
  }
  function selectObject(object: MapObject) {
    setSelected(object);
    fly(object);
    onPick?.(object.latitude, object.longitude);
    if (onPick) return;
    const camera = cameras.find((c) => c.id === object.id),
      event = events.find((e) => e.id === object.id);
    if (camera) onCameraSelect?.(camera);
    else if (event) onEventSelect?.(event);
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setMessage("");
    setResults([]);
    setSearching(true);
    try {
      const coords = parseCoordinates(query);
      if (coords) {
        fly(coords);
        onPick?.(coords.latitude, coords.longitude);
        setMessage("Карта перемещена к координатам");
        return;
      }
      const local = objects.filter((o) =>
        `${o.name} ${o.address ?? ""}`
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
      );
      if (local.length) {
        setResults(local.slice(0, 7));
        return;
      }
      const found = await searchPlaces(query, controller.signal);
      setResults(found);
      if (!found.length)
        setMessage("Ничего не найдено. Уточните адрес или введите координаты.");
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : "Поиск недоступен");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  const selectedEvent = selected && events.find((e) => e.id === selected.id),
    selectedCamera = selected && cameras.find((c) => c.id === selected.id);
  const resortGroup =
    selected?.id === "webcam-shymbulak"
      ? visibleCameras.filter(
          (c) => c.source_url === "https://shymbulak.com/live/",
        )
      : [];
  return (
    <section
      className={`op-map q-map ${compact ? "compact" : "q-map-full"}`}
      aria-label="Карта объектов Алматы"
    >
      <div className="q-map-header">
        <div className="q-map-title">
          <MapPin size={16} />
          <strong>{activeDistrict || "Карта Алматы"}</strong>
          <span>
            {visibleEvents.length} событий · {visibleCameras.length} камер
          </span>
        </div>
        <div className="q-map-modes">
          <button
            className={!three ? "active" : ""}
            onClick={() => setThree(false)}
            aria-pressed={!three}
          >
            2D
          </button>
          <button
            className={three ? "active" : ""}
            onClick={() => setThree(true)}
            aria-pressed={three}
          >
            3D
          </button>
        </div>
      </div>
      {!compact && (
        <form className="q-map-search" onSubmit={search}>
          <Search size={17} />
          <input
            aria-label="Адрес или координаты"
            placeholder="Найти адрес, объект или координаты…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            minLength={3}
          />
          <button disabled={searching}>{searching ? "Поиск…" : "Найти"}</button>
          {results.length > 0 && (
            <div className="q-map-results">
              {results.map((result) => (
                <button
                  type="button"
                  key={result.id}
                  onClick={() => {
                    selectObject(result);
                    setResults([]);
                  }}
                >
                  <MapPin size={15} />
                  <span>
                    {result.name}
                    <small>{result.address || result.district}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              <button
                type="button"
                className="q-results-close"
                onClick={() => setResults([])}
              >
                Закрыть результаты
              </button>
            </div>
          )}
        </form>
      )}
      {message && (
        <p className="q-map-message" role="status">
          {message}
          <button
            aria-label="Закрыть сообщение карты"
            onClick={() => setMessage("")}
          >
            <X size={13} />
          </button>
        </p>
      )}
      <div className="op-map-canvas q-map-canvas">
        <Suspense
          fallback={
            <div className="op-skeleton">Загрузка интерактивной карты…</div>
          }
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
            onSelect={selectObject}
            onStatus={setStatus}
            onCoordinate={onPick}
          />
        </Suspense>
        <div className="q-map-top-controls">
          <div className="q-map-basemap">
            <button
              className={basemap === "satellite" ? "active" : ""}
              onClick={() => setBasemap("satellite")}
            >
              Спутник
            </button>
            <button
              className={basemap === "streets" ? "active" : ""}
              onClick={() => setBasemap("streets")}
            >
              Улицы
            </button>
          </div>
          <button
            className="q-map-locate"
            onClick={() => chooseDistrict("")}
            aria-label="Показать весь Алматы"
            title="Показать весь Алматы"
          >
            <Crosshair size={18} />
          </button>
        </div>
        {!compact && (
          <button
            className={`q-map-district-toggle ${showDistricts ? "active" : ""}`}
            onClick={() => setShowDistricts(!showDistricts)}
            aria-expanded={showDistricts}
          >
            <Layers3 size={15} />
            Районы
          </button>
        )}
        {showDistricts && !compact && (
          <div className="q-map-districts">
            <div>
              <strong>Районы Алматы</strong>
              <button
                onClick={() => setShowDistricts(false)}
                aria-label="Свернуть районы"
              >
                <X size={14} />
              </button>
            </div>
            <button
              className={!activeDistrict ? "active" : ""}
              onClick={() => chooseDistrict("")}
            >
              Весь город<small>{events.length} событий</small>
            </button>
            {districts.map((d) => (
              <button
                key={d.id}
                className={activeDistrict === d.name ? "active" : ""}
                onClick={() => chooseDistrict(d.name)}
              >
                {d.name}
                <small>
                  {events.filter((e) => e.district === d.name).length} событий ·{" "}
                  {cameras.filter((c) => c.district === d.name).length} камер
                </small>
              </button>
            ))}
            <p>Навигационные точки. Официальные границы не подключены.</p>
          </div>
        )}
        {selected && (
          <div className="q-map-object" aria-live="polite">
            <button
              className="q-map-object-close"
              onClick={() => setSelected(null)}
              aria-label="Закрыть карточку объекта"
            >
              <X size={17} />
            </button>
            <span
              className={`q-map-object-kind ${selected.isDemo ? "demo" : ""}`}
            >
              {selected.isDemo ? "DEMO · " : ""}
              {selected.kind === "incident"
                ? "Событие"
                : selected.kind === "webcam"
                  ? "Публичная камера"
                  : "Объект города"}
            </span>
            <h3>{selected.name}</h3>
            <p>{selected.description}</p>
            <div className="q-map-object-meta">
              <MapPin size={13} />
              {selected.district}
              <span>
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
              </span>
            </div>
            {selected.locationNote && <small>{selected.locationNote}</small>}
            {selectedEvent && onEventSelect && (
              <button
                className="q-map-open"
                onClick={() => onEventSelect(selectedEvent)}
              >
                Открыть событие
                <ChevronRight size={16} />
              </button>
            )}
            {selectedCamera && onCameraSelect && (
              <button
                className="q-map-open"
                onClick={() => onCameraSelect(selectedCamera)}
              >
                Смотреть камеру
                <ChevronRight size={16} />
              </button>
            )}
            {resortGroup.length > 0 && (
              <div className="q-map-camera-group">
                <small>Общий ориентир курорта · не места установки</small>
                {resortGroup.map((camera) =>
                  onCameraSelect ? (
                    <button
                      key={camera.id}
                      onClick={() => onCameraSelect(camera)}
                    >
                      <Camera size={15} />
                      {camera.name}
                      <ChevronRight size={15} />
                    </button>
                  ) : (
                    <a
                      key={camera.id}
                      href={camera.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Camera size={15} />
                      {camera.name}
                      <ChevronRight size={15} />
                    </a>
                  ),
                )}
              </div>
            )}
            {selected.sourceUrl && (
              <a
                className="q-map-source"
                href={selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Первоисточник ↗
              </a>
            )}
          </div>
        )}
        <div className="q-map-legend">
          {[
            ["incident", "События"],
            ["webcam", "Камеры"],
            ["place", "Объекты"],
          ].map(([kind, label]) => (
            <label key={kind} className={layers.includes(kind) ? "active" : ""}>
              <input
                type="checkbox"
                checked={layers.includes(kind)}
                onChange={() =>
                  setLayers((l) =>
                    l.includes(kind)
                      ? l.filter((x) => x !== kind)
                      : [...l, kind],
                  )
                }
              />
              <i className={kind} />
              {label}
            </label>
          ))}
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
        </div>
      </div>
      <div className="op-map-foot q-map-foot">
        <span>
          <i className={status.includes("готова") ? "ready" : ""} />
          {status}
        </span>
        <span>
          {onPick
            ? "Нажмите на карту, чтобы выбрать место"
            : "Учебные события отмечены DEMO · внешние данные © владельцы"}
        </span>
      </div>
    </section>
  );
}

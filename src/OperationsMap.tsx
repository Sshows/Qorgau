import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Layers3,
  MapPin,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { city, districts, landmarks } from "./data";
import type { MapObject } from "./data";
import { publicWebcams } from "./publicSources";
import { toMapEvent, displayTime } from "./operations";
import type { EventRecord, CameraRecord } from "./operations";
import type { LiveEvent } from "./liveData";
import { eventHasCoordinates, liveEventDate } from "./liveData";
import { searchPlaces } from "./publicSearch";
import { parseCoordinates } from "./domain";
import "./map-workspace.css";

const MapView = lazy(() => import("./MapView"));
export interface OperationsMapProps {
  events: EventRecord[];
  cameras: CameraRecord[];
  liveEvents?: LiveEvent[];
  workingMode?: "real" | "demo";
  onPick?: (latitude: number, longitude: number) => void;
  compact?: boolean;
  district?: string;
  onDistrictChange?: (district: string) => void;
  onEventSelect?: (event: EventRecord) => void;
  onLiveEventSelect?: (event: LiveEvent) => void;
  onCameraSelect?: (camera: CameraRecord) => void;
  selectedCameraId?: string;
  focusPoint?: { latitude: number; longitude: number; nonce?: number };
}
const emptyLive: LiveEvent[] = [];
const cameraFormatNames: Record<string, string> = {
  hls: "HLS-видео",
  youtube: "YouTube",
  image: "Снимок",
  external: "Внешний источник",
};
function knownPoint(
  latitude: number | null,
  longitude: number | null,
): boolean {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}
export default function OperationsMap({
  events,
  cameras,
  liveEvents = emptyLive,
  workingMode = "real",
  onPick,
  compact = false,
  district = "",
  onDistrictChange,
  onEventSelect,
  onLiveEventSelect,
  onCameraSelect,
  selectedCameraId,
  focusPoint,
}: OperationsMapProps) {
  const demo = workingMode === "demo";
  const [three, setThree] = useState(false),
    [buildings, setBuildings] = useState(false),
    [roads, setRoads] = useState(false);
  const [basemap, setBasemap] = useState<"streets" | "satellite">("streets");
  const [layers, setLayers] = useState(["incident", "webcam"]),
    [selected, setSelected] = useState<MapObject | null>(null),
    [cameraId, setCameraId] = useState<string | null>(null),
    [liveId, setLiveId] = useState<string | null>(null),
    [status, setStatus] = useState("Загрузка карты…");
  const [activeDistrict, setActiveDistrict] = useState(district),
    [showDistricts, setShowDistricts] = useState(false),
    [showArchive, setShowArchive] = useState(false),
    [category, setCategory] = useState(""),
    [cameraType, setCameraType] = useState(""),
    [cameraFormat, setCameraFormat] = useState("");
  const [focus, setFocus] = useState({ ...city, height: 22000, nonce: 0 }),
    [zoomRequest, setZoomRequest] = useState<{
      direction: "in" | "out";
      nonce: number;
    }>();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<MapObject[]>([]),
    [searching, setSearching] = useState(false),
    [message, setMessage] = useState("");
  const searchRequest = useRef<AbortController | null>(null);
  const visibleEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (demo || !e.is_demo) &&
          (!activeDistrict || e.district === activeDistrict) &&
          (!category || e.category === category),
      ),
    [events, activeDistrict, category, demo],
  );
  const sourceEvents = useMemo(
    () =>
      liveEvents.filter(
        (e) =>
          (showArchive || e.status === "recent") &&
          (!category || e.category === category),
      ),
    [liveEvents, category, showArchive],
  );
  const visibleCameras = useMemo(
    () =>
      cameras.filter(
        (c) =>
          (demo || !c.is_demo) &&
          (!activeDistrict || c.district === activeDistrict) &&
          (!cameraType || c.type === cameraType) &&
          (!cameraFormat || (c.stream_type || "hls") === cameraFormat),
      ),
    [cameras, activeDistrict, demo, cameraType, cameraFormat],
  );
  const locatedEvents = useMemo(
    () => sourceEvents.filter(eventHasCoordinates),
    [sourceEvents],
  );
  const unlocatedEvents = useMemo(
    () => sourceEvents.filter((e) => !eventHasCoordinates(e)),
    [sourceEvents],
  );
  const objects = useMemo<MapObject[]>(
    () => [
      ...visibleEvents.map(toMapEvent),
      ...locatedEvents.map((e) => ({
        id: `public:${e.id}`,
        name: e.title,
        kind: "incident" as const,
        latitude: e.latitude,
        longitude: e.longitude,
        district: e.city || e.region || "Место указано источником",
        description: e.description,
        isDemo: false,
        status: e.verification,
        sourceUrl: e.url,
        provider: e.sourceName,
        updatedAt: liveEventDate(e) ?? undefined,
      })),
      ...(demo
        ? landmarks.filter(
            (l) => !activeDistrict || l.district === activeDistrict,
          )
        : []),
      ...visibleCameras
        .filter((c) => knownPoint(c.latitude, c.longitude))
        .map((c) => ({
          id: c.id,
          name: c.name,
          kind: "webcam" as const,
          latitude: c.latitude!,
          longitude: c.longitude!,
          district: c.district || "Район не указан",
          description: c.location_note,
          isDemo: c.is_demo,
          status: c.status,
          address: c.address,
          sourceUrl: c.source_url,
        })),
      ...(demo &&
      visibleCameras.some(
        (c) =>
          c.source_url === "https://shymbulak.com/live/" && c.latitude === null,
      )
        ? publicWebcams
        : []),
      ...(selected?.id.startsWith("photon-") ||
      selected?.id === "coordinate-search"
        ? [selected]
        : []),
    ],
    [
      visibleEvents,
      locatedEvents,
      visibleCameras,
      activeDistrict,
      demo,
      selected,
    ],
  );
  const categories = [
    ...new Set([
      ...events.filter((e) => demo || !e.is_demo).map((e) => e.category),
      ...liveEvents.map((e) => e.category),
    ]),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const cameraTypes = [
    ...new Set(cameras.filter((c) => demo || !c.is_demo).map((c) => c.type)),
  ];
  const cameraFormats = [
    ...new Set(
      cameras
        .filter((c) => demo || !c.is_demo)
        .map((c) => c.stream_type || "hls"),
    ),
  ];
  const sidebarCameras = [...visibleCameras].sort(
    (a, b) =>
      Number(knownPoint(b.latitude, b.longitude)) -
      Number(knownPoint(a.latitude, a.longitude)),
  );
  const selectedEvent =
    selected && visibleEvents.find((e) => e.id === selected.id);
  const selectedLive =
    sourceEvents.find((e) => e.id === liveId) ??
    (selected
      ? sourceEvents.find((e) => `public:${e.id}` === selected.id)
      : undefined);
  const selectedCamera =
    visibleCameras.find((c) => c.id === cameraId) ??
    (selected ? visibleCameras.find((c) => c.id === selected.id) : undefined);
  const selectedMapObject =
    selected ??
    objects.find(
      (object) => object.id === cameraId || object.id === `public:${liveId}`,
    ) ??
    null;
  const resortGroup =
    demo && selected?.id === "webcam-shymbulak"
      ? visibleCameras.filter(
          (c) => c.source_url === "https://shymbulak.com/live/",
        )
      : [];
  const hasSelection = Boolean(selected || selectedLive || selectedCamera);
  function fly(point: { latitude: number; longitude: number }, height = 5500) {
    setFocus({ ...point, height, nonce: Date.now() });
  }
  function clearSelection() {
    setSelected(null);
    setCameraId(null);
    setLiveId(null);
  }
  function selectObject(object: MapObject) {
    setSelected(object);
    setCameraId(null);
    setLiveId(null);
    fly(object);
    onPick?.(object.latitude, object.longitude);
  }
  function selectCamera(camera: CameraRecord) {
    clearSelection();
    setCameraId(camera.id);
    if (knownPoint(camera.latitude, camera.longitude))
      fly({ latitude: camera.latitude!, longitude: camera.longitude! });
  }
  function selectLive(event: LiveEvent) {
    clearSelection();
    setLiveId(event.id);
    if (eventHasCoordinates(event)) fly(event);
  }
  useEffect(() => {
    setActiveDistrict(district);
    const p = districts.find((d) => d.name === district);
    setFocus({ ...(p ?? city), height: p?.height ?? 22000, nonce: Date.now() });
    clearSelection();
  }, [district]);
  useEffect(() => {
    if (focusPoint && knownPoint(focusPoint.latitude, focusPoint.longitude))
      setFocus({
        ...focusPoint,
        height: 4500,
        nonce: focusPoint.nonce ?? Date.now(),
      });
  }, [focusPoint?.latitude, focusPoint?.longitude, focusPoint?.nonce]);
  useEffect(() => {
    if (!selectedCameraId) return;
    const camera = cameras.find((c) => c.id === selectedCameraId);
    if (camera) {
      setSelected(null);
      setLiveId(null);
      setCameraId(camera.id);
      if (knownPoint(camera.latitude, camera.longitude))
        fly({ latitude: camera.latitude!, longitude: camera.longitude! });
      else if (demo && camera.source_url === "https://shymbulak.com/live/") {
        const p = publicWebcams[0];
        setSelected(p);
        fly(p);
      }
    }
  }, [selectedCameraId, cameras, demo]);
  useEffect(() => () => searchRequest.current?.abort(), []);
  function chooseDistrict(value: string) {
    setActiveDistrict(value);
    onDistrictChange?.(value);
    const p = districts.find((d) => d.name === value);
    fly(p ?? city, p?.height ?? 22000);
    clearSelection();
  }
  async function search(event: React.FormEvent) {
    event.preventDefault();
    searchRequest.current?.abort();
    if (query.trim().length < 3) {
      setMessage("Введите минимум три символа адреса, района или объекта.");
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    searchRequest.current = controller;
    setMessage("");
    setResults([]);
    setSearching(true);
    try {
      const coords = parseCoordinates(query);
      if (coords) {
        selectObject({
          ...coords,
          id: "coordinate-search",
          name: "Введённые координаты",
          kind: "place",
          district: "Пользовательская точка",
          description:
            "Точка выбрана по введённым координатам. Она не обозначает происшествие или камеру.",
          isDemo: false,
        });
        setMessage("Карта перемещена к координатам");
        return;
      }
      const districtMatch = districts.find((d) =>
        d.name
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
      );
      if (districtMatch) {
        chooseDistrict(districtMatch.name);
        setMessage(
          `Показан ${districtMatch.name} район · навигационный ориентир`,
        );
        return;
      }
      const local = objects.filter((o) =>
        `${o.name} ${o.address ?? ""} ${o.district}`
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
      );
      if (local.length) {
        setResults(local.slice(0, 7));
        return;
      }
      const cameraWithoutPoint = visibleCameras.find((camera) =>
        `${camera.name} ${camera.address} ${camera.district}`
          .toLocaleLowerCase("ru")
          .includes(query.trim().toLocaleLowerCase("ru")),
      );
      if (cameraWithoutPoint) {
        selectCamera(cameraWithoutPoint);
        setMessage(
          "Камера найдена. Источник не указал точные координаты; карточка открыта без маркера.",
        );
        return;
      }
      const found = await searchPlaces(query, controller.signal);
      setResults(found);
      if (!found.length)
        setMessage("Ничего не найдено. Уточните адрес или координаты.");
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : "Поиск недоступен");
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  return (
    <section
      className={`op-map q-map q-map-working ${demo ? "q-map-demo" : "q-map-real"} ${compact ? "compact" : "q-map-full"} ${hasSelection ? "has-selection" : ""}`}
      aria-label="Карта объектов Алматы"
    >
      <div className="q-map-header">
        <div className="q-map-title">
          <MapPin size={16} />
          <strong>{activeDistrict || "Алматы"}</strong>
          <span>{demo ? "Учебный режим" : "Публичные источники"}</span>
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
            placeholder="Улица, адрес, район или объект Алматы…"
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
      {!compact && (
        <div className="q-map-data-controls">
          {categories.length > 0 && (
            <label>
              События
              <select
                aria-label="Категория событий карты"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  clearSelection();
                }}
              >
                <option value="">Все категории</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {cameraTypes.length > 0 && (
            <label>
              Камеры
              <select
                aria-label="Тип камер на карте"
                value={cameraType}
                onChange={(e) => {
                  setCameraType(e.target.value);
                  clearSelection();
                }}
              >
                <option value="">Все типы</option>
                {cameraTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
          )}
          {cameraFormats.length > 1 && (
            <label>
              Формат
              <select
                aria-label="Формат камер на карте"
                value={cameraFormat}
                onChange={(e) => {
                  setCameraFormat(e.target.value);
                  clearSelection();
                }}
              >
                <option value="">Все форматы</option>
                {cameraFormats.map((format) => (
                  <option key={format} value={format}>
                    {cameraFormatNames[format] || format}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!demo && (
            <label className="q-map-archive">
              <input
                type="checkbox"
                checked={showArchive}
                onChange={(e) => {
                  setShowArchive(e.target.checked);
                  clearSelection();
                }}
              />
              Архив источников
            </label>
          )}
          <span>
            {locatedEvents.length + visibleEvents.length} с координатами ·{" "}
            {unlocatedEvents.length} без координат
          </span>
        </div>
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
      <div className="q-map-display">
        <div className="op-map-canvas q-map-canvas">
          <Suspense
            fallback={<div className="op-skeleton">Загрузка карты Алматы…</div>}
          >
            <MapView
              objects={objects}
              visibleKinds={
                selected?.id.startsWith("photon-") ||
                selected?.id === "coordinate-search"
                  ? [...layers, "place"]
                  : layers
              }
              selected={selectedMapObject}
              focus={focus}
              zoomRequest={zoomRequest}
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
            <div className="q-map-navigation">
              <button
                className="q-map-locate"
                onClick={() => chooseDistrict("")}
                aria-label="Показать весь Алматы"
                title="Показать весь Алматы"
              >
                <Crosshair size={18} />
              </button>
              <button
                className="q-map-locate"
                onClick={() =>
                  setZoomRequest({ direction: "in", nonce: Date.now() })
                }
                aria-label="Приблизить карту"
              >
                <Plus size={18} />
              </button>
              <button
                className="q-map-locate"
                onClick={() =>
                  setZoomRequest({ direction: "out", nonce: Date.now() })
                }
                aria-label="Отдалить карту"
              >
                <Minus size={18} />
              </button>
            </div>
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
                Весь город
              </button>
              {districts.map((d) => (
                <button
                  key={d.id}
                  className={activeDistrict === d.name ? "active" : ""}
                  onClick={() => chooseDistrict(d.name)}
                >
                  {d.name}
                  <small>
                    {
                      cameras.filter(
                        (c) => (demo || !c.is_demo) && c.district === d.name,
                      ).length
                    }{" "}
                    камер с указанным районом
                  </small>
                </button>
              ))}
              <p>
                Районы — навигационные ориентиры, не официальные границы.
                Публикации без указанного района не распределяются по районам
                автоматически.
              </p>
            </div>
          )}
          <div className="q-map-legend">
            {[
              ["incident", "События"],
              ["webcam", "Камеры"],
              ...(demo ? [["place", "Учебные объекты"]] : []),
            ].map(([kind, label]) => (
              <label
                key={kind}
                className={layers.includes(kind) ? "active" : ""}
              >
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
                <label title="Реальные контуры OpenStreetMap. При отсутствии высоты в источнике она приблизительная.">
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
                  Дороги OSM
                </label>
              </>
            )}
          </div>
          {!demo && objects.length === 0 && (
            <div className="q-map-empty-overlay">
              <span className="q-map-empty-dot" />
              Нет событий с подтверждёнными координатами в выбранной выборке
            </div>
          )}
        </div>
        {(!compact || hasSelection) && (
          <aside
            className={`q-map-side ${hasSelection ? "selected" : ""}`}
            aria-label="Информация об объекте карты"
          >
            {hasSelection ? (
              <>
                <button
                  className="q-map-side-close"
                  onClick={clearSelection}
                  aria-label="Закрыть карточку объекта"
                >
                  <X size={17} />
                </button>
                <span className={`q-map-object-kind ${demo ? "demo" : ""}`}>
                  {demo ? "DEMO · " : ""}
                  {selectedCamera
                    ? "Публичная камера"
                    : selectedLive
                      ? selectedLive.category
                      : selected?.kind === "incident"
                        ? "Событие"
                        : "Объект карты"}
                </span>
                <h3>
                  {selectedCamera?.name ||
                    selectedLive?.title ||
                    selected?.name}
                </h3>
                <p>
                  {selectedCamera?.location_note ||
                    selectedLive?.description ||
                    selected?.description}
                </p>
                {selectedLive ? (
                  <>
                    <div className="q-map-verification">
                      {selectedLive.verification}
                    </div>
                    <dl>
                      <dt>Источник</dt>
                      <dd>{selectedLive.sourceName}</dd>
                      <dt>Дата события</dt>
                      <dd>
                        {selectedLive.occurredAt
                          ? displayTime(selectedLive.occurredAt)
                          : "Не указана источником"}
                      </dd>
                      <dt>Опубликовано</dt>
                      <dd>
                        {selectedLive.publishedAt
                          ? displayTime(selectedLive.publishedAt)
                          : "Не указано"}
                      </dd>
                      <dt>Проверено</dt>
                      <dd>{displayTime(selectedLive.checkedAt)}</dd>
                      <dt>Координаты</dt>
                      <dd>
                        {eventHasCoordinates(selectedLive)
                          ? `${selectedLive.latitude.toFixed(4)}, ${selectedLive.longitude.toFixed(4)}`
                          : "Не предоставлены · маркера нет"}
                      </dd>
                    </dl>
                    {selectedLive.status === "archive" && (
                      <p className="q-map-verification archive">
                        Архив источника · не текущее происшествие
                      </p>
                    )}
                    <a
                      className="q-map-source"
                      href={selectedLive.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      Оригинальная публикация
                    </a>
                    {onLiveEventSelect && (
                      <button
                        className="q-map-open"
                        onClick={() => onLiveEventSelect(selectedLive)}
                      >
                        Подробнее о публикации
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </>
                ) : selectedCamera ? (
                  <>
                    <dl>
                      <dt>Район / адрес</dt>
                      <dd>
                        {selectedCamera.district || "Не указан"} ·{" "}
                        {selectedCamera.address}
                      </dd>
                      <dt>Координаты</dt>
                      <dd>
                        {knownPoint(
                          selectedCamera.latitude,
                          selectedCamera.longitude,
                        )
                          ? `${selectedCamera.latitude}, ${selectedCamera.longitude}`
                          : "Не подтверждены · отдельный маркер не добавлен"}
                      </dd>
                      <dt>Доступность</dt>
                      <dd>{selectedCamera.status}</dd>
                    </dl>
                    <a
                      className="q-map-source"
                      href={selectedCamera.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} />
                      Первоисточник камеры
                    </a>
                    {onCameraSelect && (
                      <button
                        className="q-map-open"
                        onClick={() => onCameraSelect(selectedCamera)}
                      >
                        Открыть просмотр камеры
                        <ChevronRight size={16} />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="q-map-object-meta">
                      <MapPin size={13} />
                      {selected?.district}
                      <span>
                        {selected?.latitude.toFixed(5)},{" "}
                        {selected?.longitude.toFixed(5)}
                      </span>
                    </div>
                    {selected?.locationNote && (
                      <small>{selected.locationNote}</small>
                    )}
                    {selectedEvent && onEventSelect && (
                      <button
                        className="q-map-open"
                        onClick={() => onEventSelect(selectedEvent)}
                      >
                        Открыть событие
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {selected?.sourceUrl && (
                      <a
                        className="q-map-source"
                        href={selected.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} />
                        Первоисточник
                      </a>
                    )}
                    {resortGroup.length > 0 && (
                      <div className="q-map-camera-group">
                        <small>
                          Общий ориентир курорта · не места установки
                        </small>
                        {resortGroup.map((c) =>
                          onCameraSelect ? (
                            <button
                              key={c.id}
                              onClick={() => onCameraSelect(c)}
                            >
                              <Camera size={14} />
                              {c.name}
                              <ChevronRight size={14} />
                            </button>
                          ) : (
                            <a
                              key={c.id}
                              href={c.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {c.name}
                              <ExternalLink size={14} />
                            </a>
                          ),
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <span className="q-map-object-kind">ОБЪЕКТЫ КАРТЫ</span>
                <h3>Только известное местоположение</h3>
                <p>
                  Маркеры добавляются по координатам источника. Публикации без
                  координат остаются в списке.
                </p>
                <div className="q-map-counts">
                  <span>
                    <strong>
                      {locatedEvents.length + visibleEvents.length}
                    </strong>
                    событий на карте
                  </span>
                  <span>
                    <strong>
                      {
                        visibleCameras.filter((c) =>
                          knownPoint(c.latitude, c.longitude),
                        ).length
                      }
                    </strong>
                    камер с координатами
                  </span>
                </div>
                {locatedEvents.slice(0, 4).map((e) => (
                  <button
                    className="q-map-record"
                    key={e.id}
                    onClick={() => selectLive(e)}
                  >
                    <span>
                      {e.title}
                      <small>
                        {e.sourceName} ·{" "}
                        {e.status === "archive"
                          ? "архив"
                          : "публикация / измерение"}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
                {sidebarCameras.slice(0, 4).map((c) => (
                  <button
                    className="q-map-record"
                    key={c.id}
                    onClick={() => selectCamera(c)}
                  >
                    <Camera size={15} />
                    <span>
                      {c.name}
                      <small>
                        {knownPoint(c.latitude, c.longitude)
                          ? "Координаты указаны источником"
                          : "Без точных координат"}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
                {unlocatedEvents.length > 0 && (
                  <>
                    <h4>
                      Без координат <span>{unlocatedEvents.length}</span>
                    </h4>
                    {unlocatedEvents.slice(0, 5).map((e) => (
                      <button
                        className="q-map-record"
                        key={e.id}
                        onClick={() => selectLive(e)}
                      >
                        <span>
                          {e.title}
                          <small>{e.sourceName}</small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))}
                  </>
                )}
                {!sourceEvents.length && !visibleEvents.length && (
                  <div className="q-map-no-events">
                    {demo
                      ? "Учебных событий в выборке нет."
                      : "Новых публикаций с подходящими данными в выборке нет. Это не означает отсутствия происшествий в городе."}
                  </div>
                )}
              </>
            )}
          </aside>
        )}
      </div>
      <div className="op-map-foot q-map-foot">
        <span>
          <i className={status.includes("готова") ? "ready" : ""} />
          {status}
        </span>
        <span>
          {onPick
            ? "Нажмите на карту, чтобы выбрать место"
            : demo
              ? "Учебные объекты изолированы в DEMO"
              : "Улицы и снимки © владельцы · нет вымышленных происшествий"}
        </span>
      </div>
    </section>
  );
}

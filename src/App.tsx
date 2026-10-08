import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Box,
  Building2,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Download,
  Eye,
  Layers3,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { city, districts, incidents, objects, patrols } from "./data";
import type { MapObject } from "./data";
import { nearestPatrol, parseCoordinates, searchLocal } from "./domain";
import { getRoute, loadPolice } from "./services";
import type { RouteResult } from "./services";
import {
  additionalCameraLinks,
  publicCameraSources,
  publicWebcams,
  twoGisTrafficUrl,
} from "./publicSources";

const MapView = lazy(() => import("./MapView"));
const PublicCameraPlayer = lazy(() => import("./PublicCameraPlayer"));
const SearchHub = lazy(() => import("./SearchHub"));
const kindNames: Record<string, string> = {
  incident: "Происшествие",
  camera: "Камера",
  webcam: "Публичные веб-камеры",
  patrol: "Патруль",
  place: "Городской объект",
  police: "Объект OSM",
};
const kindIcons = {
  incident: TriangleAlert,
  camera: Camera,
  webcam: Radio,
  patrol: Navigation,
  place: MapPin,
  police: ShieldCheck,
};
const layerConfig = [
  {
    id: "webcam",
    name: "Публичные веб-камеры",
    subtitle: "Шымбулак · 3 вида",
    icon: Radio,
    color: "cyan",
  },
  {
    id: "incident",
    name: "Происшествия",
    subtitle: "Учебные сценарии",
    icon: TriangleAlert,
    color: "orange",
  },
  {
    id: "camera",
    name: "Камеры",
    subtitle: "Демонстрационные точки",
    icon: Camera,
    color: "blue",
  },
  {
    id: "patrol",
    name: "Патрули",
    subtitle: "Демонстрационные экипажи",
    icon: Navigation,
    color: "green",
  },
  {
    id: "place",
    name: "Городские объекты",
    subtitle: "Места и ориентиры",
    icon: MapPin,
    color: "gray",
  },
  {
    id: "police",
    name: "Объекты полиции · OSM",
    subtitle: "Публичные отметки на карте",
    icon: ShieldCheck,
    color: "purple",
  },
];

class MapBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="map-error">
        <TriangleAlert size={30} />
        <h3>Карта не загрузилась</h3>
        <p>Обновите страницу в браузере с поддержкой WebGL.</p>
        <button onClick={() => location.reload()}>Обновить страницу</button>
      </div>
    ) : (
      this.props.children
    );
  }
}

class CameraBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="public-camera-loading" role="status">
        <p>
          Плеер не загрузился. Обновите страницу или откройте камеры у
          владельца.
        </p>
        <a
          className="public-camera-source"
          href="https://shymbulak.com/live/"
          target="_blank"
          rel="noreferrer"
        >
          Официальные камеры Шымбулака ↗
        </a>
        <button
          className="public-camera-start"
          onClick={() => location.reload()}
        >
          Обновить страницу
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

function App() {
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState<MapObject | null>(incidents[0]);
  const [focus, setFocus] = useState<{
    longitude: number;
    latitude: number;
    height: number;
    nonce: number;
  } | null>(null);
  const [district, setDistrict] = useState("all");
  const [visibleKinds, setVisibleKinds] = useState([
    "webcam",
    "incident",
    "camera",
    "patrol",
    "place",
  ]);
  const [buildings, setBuildings] = useState(true);
  const [roads, setRoads] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [basemap, setBasemap] = useState<"satellite" | "streets">("satellite");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [customPoint, setCustomPoint] = useState<MapObject | null>(null);
  const [mapStatus, setMapStatus] = useState("Загрузка карты");
  const [police, setPolice] = useState<MapObject[]>([]);
  const [policeStatus, setPoliceStatus] = useState("");
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [info, setInfo] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const closeHub = useCallback(() => setHubOpen(false), []);
  const [cameraId, setCameraId] = useState(publicCameraSources[0].id);
  const cameraClose = useRef<HTMLButtonElement>(null);
  const activeCamera =
    publicCameraSources.find((source) => source.id === cameraId) ??
    publicCameraSources[0];
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [timeline, setTimeline] = useState(100);
  const [severity, setSeverity] = useState("all");
  const routeRequest = useRef<AbortController | null>(null);
  const policeRequest = useRef<AbortController | null>(null);
  const selectedRef = useRef(selected);
  const mapPanel = useRef<HTMLDivElement>(null);
  selectedRef.current = selected;
  const currentDistrict = districts.find((value) => value.id === district);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setTimeline((value) => Math.min(100, value + 1)),
      700,
    );
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (timeline >= 100) setPlaying(false);
  }, [timeline]);
  useEffect(
    () => () => {
      routeRequest.current?.abort();
      policeRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setInfo(false);
        setCameraOpen(false);
        setSearchOpen(false);
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    if (!cameraOpen) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cameraClose.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog =
        cameraClose.current?.closest<HTMLElement>("[role='dialog']");
      const controls = dialog?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], video[controls]",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      previous?.focus();
    };
  }, [cameraOpen]);

  const fly = useCallback(
    (point: { longitude: number; latitude: number }, height = 1800) =>
      setFocus({ ...point, height, nonce: Date.now() }),
    [],
  );
  const selectObject = useCallback(
    (object: MapObject) => {
      routeRequest.current?.abort();
      setRouteLoading(false);
      setSelected(object);
      setRoute(null);
      setVisibleKinds((value) => [...new Set([...value, object.kind])]);
      fly(object);
      setSearchOpen(false);
      setSidebarOpen(false);
    },
    [fly],
  );
  const allObjects = useMemo(
    () => [
      ...publicWebcams,
      ...objects,
      ...police,
      ...(customPoint ? [customPoint] : []),
    ],
    [police, customPoint],
  );
  const visibleIncidents = useMemo(
    () =>
      incidents.filter((object) => {
        const [hours, minutes] = (object.updatedAt ?? "14:24")
          .split(":")
          .map(Number);
        return hours * 60 + minutes <= 864 + timeline * 0.2;
      }),
    [timeline],
  );
  const districtObjects = useMemo(
    () =>
      allObjects.filter(
        (object) =>
          !currentDistrict || object.district === currentDistrict.name,
      ),
    [allObjects, currentDistrict],
  );
  const mapObjects = useMemo(
    () =>
      districtObjects.filter(
        (object) =>
          object.kind !== "incident" ||
          (visibleIncidents.some((incident) => incident.id === object.id) &&
            (severity === "all" || object.severity === severity)),
      ),
    [districtObjects, visibleIncidents, severity],
  );
  const shownIncidents = visibleIncidents
    .filter(
      (object) =>
        (!currentDistrict || object.district === currentDistrict.name) &&
        (severity === "all" || object.severity === severity),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const results = useMemo(
    () =>
      query.trim()
        ? searchLocal(query)
            .concat(
              police.filter((object) =>
                object.name.toLowerCase().includes(query.toLowerCase()),
              ),
            )
            .slice(0, 7)
        : searchLocal("площадь").slice(0, 3),
    [query, police],
  );
  const resourceObjects = districtObjects.filter((object) =>
    ["webcam", "camera", "patrol", "police"].includes(object.kind),
  );
  const nearby = selected
    ? nearestPatrol(
        selected,
        patrols.filter((patrol) => patrol.status === "Свободен"),
      )
    : null;
  useEffect(() => {
    if (
      selected?.kind === "incident" &&
      !visibleIncidents.some((object) => object.id === selected.id)
    ) {
      setSelected(null);
      setRoute(null);
      routeRequest.current?.abort();
      setRouteLoading(false);
    }
  }, [selected, visibleIncidents]);

  function changeDistrict(id: string) {
    setDistrict(id);
    setSelected(null);
    setRoute(null);
    routeRequest.current?.abort();
    setRouteLoading(false);
    const target = districts.find((value) => value.id === id);
    fly(target ?? city, target?.height ?? city.height);
  }
  async function toggleLayer(id: string) {
    const enable = !visibleKinds.includes(id);
    setVisibleKinds((value) =>
      enable ? [...value, id] : value.filter((kind) => kind !== id),
    );
    if (id === "police" && enable && police.length === 0) {
      policeRequest.current?.abort();
      const controller = new AbortController();
      policeRequest.current = controller;
      setPoliceStatus("Загрузка открытых данных…");
      try {
        const data = await loadPolice(controller.signal);
        setPolice(data);
        setPoliceStatus(
          data.length
            ? `${data.length} отметок OSM · центральная часть города`
            : "В наборе нет отметок полиции.",
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setPoliceStatus(
            error instanceof Error ? error.message : "Ошибка загрузки.",
          );
      }
    }
  }
  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearchMessage("");
    const coords = parseCoordinates(query);
    if (coords) {
      const point: MapObject = {
        id: "coordinate-search",
        name: "Точка по координатам",
        kind: "place",
        ...coords,
        district: "Алматы",
        description: "Координаты введены пользователем.",
        isDemo: false,
        address: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
      };
      setCustomPoint(point);
      setDistrict("all");
      selectObject(point);
      return;
    }
    const preset = districts.find((value) =>
      query
        .toLowerCase()
        .includes(value.name.toLowerCase().replace(" район", "")),
    );
    if (preset) {
      changeDistrict(preset.id);
      setSearchOpen(false);
      return;
    }
    if (results.length) {
      setDistrict("all");
      if (results[0].kind === "incident") setTimeline(100);
      selectObject(results[0]);
      return;
    }
    setSearchMessage(
      "Место не найдено. Выберите ориентир или введите координаты в пределах Алматы: 43.238, 76.945.",
    );
    setSearchOpen(true);
  }
  async function buildRoute() {
    if (!selected || !nearby) return;
    routeRequest.current?.abort();
    const controller = new AbortController();
    routeRequest.current = controller;
    setRouteLoading(true);
    const destination = selected;
    try {
      const result = await getRoute(
        nearby.patrol,
        destination,
        controller.signal,
      );
      if (selectedRef.current?.id !== destination.id) return;
      setRoute(result);
      setVisibleKinds((value) => [
        ...new Set([...value, "patrol", destination.kind]),
      ]);
      fly(
        {
          longitude: (nearby.patrol.longitude + destination.longitude) / 2,
          latitude: (nearby.patrol.latitude + destination.latitude) / 2,
        },
        Math.max(2500, result.distanceKm * 1700),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setRoute({
          points: [
            [nearby.patrol.longitude, nearby.patrol.latitude],
            [destination.longitude, destination.latitude],
          ],
          label: "Прямая линия · сервис дорог недоступен",
          distanceKm: nearby.distanceKm,
          durationMin: 0,
          isFallback: true,
        });
        setToast(
          error instanceof Error
            ? `${error.message} Показана прямая линия.`
            : "Показана прямая линия.",
        );
      }
    } finally {
      if (!controller.signal.aborted) setRouteLoading(false);
    }
  }
  function exportScene() {
    const payload = {
      title: "QORGAU Vision · Almaty",
      version: 1,
      demo: true,
      district: currentDistrict?.name ?? "Алматы",
      visibleKinds,
      is3D,
      basemap,
      selected,
      route,
      objects: mapObjects.filter((object) =>
        visibleKinds.includes(object.kind),
      ),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "qorgau-almaty-scene.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Сценарий сохранён в JSON.");
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await mapPanel.current?.requestFullscreen();
    } catch {
      setToast("Полноэкранный режим недоступен в этом браузере.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Qorgau Vision главная">
          <span className="brand-mark">
            <ShieldCheck size={25} />
          </span>
          <span>
            QORGAU<span className="brand-sub">VISION</span>
          </span>
          <span className="brand-version">v.01</span>
        </a>
        <nav className="main-nav" aria-label="Основная навигация">
          {[
            ["overview", "Обзор"],
            ["incidents", "Происшествия"],
            ["resources", "Ресурсы"],
          ].map(([id, name]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              key={id}
            >
              {name}
              {id === "incidents" ? (
                <span className="nav-count">{incidents.length}</span>
              ) : null}
            </button>
          ))}
          <button
            className={cameraOpen ? "active" : ""}
            onClick={() => setCameraOpen(true)}
          >
            <Radio size={14} /> Камеры
          </button>
          <button
            className={hubOpen ? "active" : ""}
            onClick={() => {
              setCameraOpen(false);
              setHubOpen(true);
            }}
          >
            <Search size={14} /> Поиск
          </button>
        </nav>
        <div className="topbar-right">
          <span className="demo-label">
            <span />
            ДЕМО СРЕДА
          </span>
          <button
            className="icon-button help"
            aria-label="О проекте"
            onClick={() => setInfo(true)}
          >
            <CircleHelp size={18} />
          </button>
          <span className="operator-avatar">Q</span>
        </div>
      </header>
      <div className="workspace">
        <aside className={`sidebar ${sidebarOpen ? "mobile-open" : ""}`}>
          <div className="workspace-label">
            РАБОЧАЯ ОБЛАСТЬ{" "}
            <button
              aria-label="Закрыть слои"
              className="mobile-close icon-button"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="city-card">
            <span className="city-icon">
              <MapPin size={19} />
            </span>
            <div>
              <strong>Алматы</strong>
              <small>Республика Казахстан</small>
            </div>
            <span className="city-indicator" />
          </div>
          <div className="sidebar-section-heading">
            ТЕРРИТОРИЯ<span>08</span>
          </div>
          <button
            className={`district-row ${district === "all" ? "chosen" : ""}`}
            onClick={() => changeDistrict("all")}
          >
            <Crosshair size={15} />
            <span>Весь город</span>
            <ChevronRight size={14} />
          </button>
          <div className="districts">
            {districts.map((value) => (
              <button
                key={value.id}
                className={`district-row ${district === value.id ? "chosen" : ""}`}
                onClick={() => changeDistrict(value.id)}
              >
                <span className="district-dot" />
                <span>{value.name.replace(" район", "")}</span>
                <span className="district-object-count">
                  {objects.filter(
                    (object) =>
                      object.district === value.name && object.kind !== "place",
                  ).length || "—"}
                </span>
              </button>
            ))}
          </div>
          <div className="section-divider" />
          <div className="sidebar-section-heading">
            СЛОИ КАРТЫ
            <Layers3 size={14} />
          </div>
          <div className="layer-list">
            {layerConfig.map((layer) => (
              <button
                key={layer.id}
                className="layer-row"
                onClick={() => void toggleLayer(layer.id)}
                role="switch"
                aria-checked={visibleKinds.includes(layer.id)}
              >
                <span className={`layer-icon ${layer.color}`}>
                  <layer.icon size={16} />
                </span>
                <span className="layer-copy">
                  <strong>{layer.name}</strong>
                  <small>{layer.subtitle}</small>
                </span>
                <span
                  className={`switch ${visibleKinds.includes(layer.id) ? "on" : ""}`}
                >
                  <i />
                </span>
              </button>
            ))}
          </div>
          {policeStatus ? (
            <p className="sidebar-note" role="status">
              {policeStatus}
            </p>
          ) : null}
          <div className="section-divider" />
          <button
            className="compact-layer"
            role="switch"
            aria-checked={buildings}
            onClick={() => setBuildings((value) => !value)}
          >
            <Building2 size={16} />
            <span>3D-здания · OSM</span>
            <span className={`small-check ${buildings ? "checked" : ""}`}>
              {buildings ? <Check size={11} /> : null}
            </span>
          </button>
          <button
            className="compact-layer"
            role="switch"
            aria-checked={roads}
            onClick={() => setRoads((value) => !value)}
          >
            <Route size={16} />
            <span>Дорожная сеть · OSM</span>
            <span className={`small-check ${roads ? "checked" : ""}`}>
              {roads ? <Check size={11} /> : null}
            </span>
          </button>
          <div className="sidebar-bottom">
            <a
              className="traffic-source-card"
              href={twoGisTrafficUrl(currentDistrict ?? city)}
              target="_blank"
              rel="noreferrer"
            >
              <Route size={18} />
              <span>
                <strong>Пробки · 2ГИС</strong>
                <small>ДТП, работы и перекрытия</small>
              </span>
              <ArrowUpRight size={15} />
            </a>
            <div className="source-status">
              <span className="status-dot" />
              Открытые геоданные
            </div>
            <p>
              Оперативные объекты — учебные.
              <br />
              Центральная часть Алматы · OSM
            </p>
            <button onClick={() => setInfo(true)}>
              Источники и ограничения
              <ArrowUpRight size={13} />
            </button>
          </div>
        </aside>
        <main className="main-content">
          <section className="page-heading">
            <div>
              <div className="breadcrumb">
                Казахстан <ChevronRight size={12} /> Алматы{" "}
                <ChevronRight size={12} />{" "}
                <span>
                  {tab === "overview"
                    ? "Оперативный обзор"
                    : tab === "incidents"
                      ? "Происшествия"
                      : "Ресурсы"}
                </span>
              </div>
              <h1>
                {tab === "overview"
                  ? "Город под наблюдением"
                  : tab === "incidents"
                    ? "Журнал происшествий"
                    : "Ресурсы города"}
                <span className="heading-dot" />
              </h1>
              <p>
                {tab === "overview"
                  ? "Единая картина города. Данные, объекты и сценарии в одном месте."
                  : tab === "incidents"
                    ? "Демонстрационные события и визуальные маршруты реагирования."
                    : "Публичные веб-камеры, учебные экипажи и открытые городские объекты."}
              </p>
            </div>
            <button
              className="secondary-button export-button"
              onClick={exportScene}
            >
              <Download size={15} />
              Экспорт сценария
            </button>
          </section>
          <section
            className="metric-grid"
            aria-label="Сводка демонстрационных объектов"
          >
            {[
              {
                icon: TriangleAlert,
                label: "Происшествия",
                value: shownIncidents.length,
                note: "учебные события",
                color: "orange",
                kind: "incident",
              },
              {
                icon: Camera,
                label: "Веб-камеры",
                value: districtObjects.some(
                  (object) => object.kind === "webcam",
                )
                  ? publicCameraSources.length
                  : 0,
                note: `${districtObjects.filter((object) => object.kind === "camera").length} demo-точек отдельно`,
                color: "cyan",
                kind: "webcam",
              },
              {
                icon: Navigation,
                label: "Патрули",
                value: districtObjects.filter(
                  (object) => object.kind === "patrol",
                ).length,
                note: "учебные экипажи",
                color: "green",
                kind: "patrol",
              },
              {
                icon: Layers3,
                label: "Активные слои",
                value: visibleKinds.length + Number(buildings) + Number(roads),
                note: "публичные и demo",
                color: "gray",
                kind: "layers",
              },
            ].map((metric) => (
              <button
                className="metric-card"
                key={metric.label}
                onClick={() => {
                  if (metric.kind === "layers") {
                    setSidebarOpen(true);
                    return;
                  }
                  setVisibleKinds((value) => [
                    ...new Set([...value, metric.kind]),
                  ]);
                  if (metric.kind === "webcam") {
                    setCameraOpen(true);
                    return;
                  }
                  setTab(
                    metric.kind === "incident" ? "incidents" : "resources",
                  );
                }}
              >
                <div className="metric-top">
                  <span>{metric.label}</span>
                  <metric.icon size={17} className={metric.color} />
                </div>
                <div className="metric-bottom">
                  <strong>{String(metric.value).padStart(2, "0")}</strong>
                  <small>{metric.note}</small>
                </div>
              </button>
            ))}
          </section>
          <section className="operations-grid">
            <div className="map-and-timeline">
              <div ref={mapPanel} className="map-panel">
                <MapBoundary>
                  <Suspense
                    fallback={
                      <div className="map-loading">
                        <span className="loading-ring" />
                        <p>Открываем Алматы</p>
                        <small>Загрузка 3D-карты</small>
                      </div>
                    }
                  >
                    <MapView
                      objects={mapObjects}
                      visibleKinds={visibleKinds}
                      selected={selected}
                      focus={focus}
                      basemap={basemap}
                      is3D={is3D}
                      buildings={buildings}
                      roads={roads}
                      route={route}
                      onSelect={selectObject}
                      onStatus={setMapStatus}
                    />
                  </Suspense>
                </MapBoundary>
                <div className="map-top">
                  <button
                    className="mobile-layers map-chip"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <Layers3 size={14} />
                    Слои
                  </button>
                  <span className="map-chip location-chip">
                    <span className="status-dot" />
                    {currentDistrict?.name ?? "Алматы"}
                    <span className="chip-divider" />
                    KZ · ALA
                  </span>
                  <div className="basemap-switch">
                    <button
                      onClick={() => setBasemap("satellite")}
                      className={basemap === "satellite" ? "selected" : ""}
                    >
                      Спутник
                    </button>
                    <button
                      onClick={() => setBasemap("streets")}
                      className={basemap === "streets" ? "selected" : ""}
                    >
                      Карта
                    </button>
                  </div>
                </div>
                <form className="map-search" onSubmit={submitSearch}>
                  <Search size={17} />
                  <input
                    aria-label="Поиск по Алматы"
                    placeholder="Место, район или координаты…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSearchMessage("");
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                  />
                  <kbd>↵</kbd>
                  {query ? (
                    <button
                      type="button"
                      aria-label="Очистить поиск"
                      onClick={() => {
                        setQuery("");
                        setSearchMessage("");
                      }}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                  <button
                    className="search-submit"
                    type="submit"
                    aria-label="Найти"
                  >
                    <ArrowRight size={16} />
                  </button>
                </form>
                {searchOpen ? (
                  <div className="search-results">
                    <div className="search-result-heading">
                      {query ? "Найденные места" : "Места Алматы"}
                      <button
                        aria-label="Закрыть поиск"
                        onClick={() => setSearchOpen(false)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    {results.map((object) => (
                      <button
                        key={object.id}
                        onClick={() => {
                          setDistrict("all");
                          if (object.kind === "incident") setTimeline(100);
                          selectObject(object);
                        }}
                      >
                        <MapPin size={15} />
                        <span>
                          {object.name}
                          <small>{object.address || object.district}</small>
                        </span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                    {searchMessage ? (
                      <p role="status">{searchMessage}</p>
                    ) : (
                      <p>
                        Поиск по встроенным местам и координатам.
                        <br />
                        Организации и адреса доступны в разделе «Поиск» →
                        «Организации».
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="map-tools">
                  <a
                    className="traffic-map-button"
                    href={twoGisTrafficUrl(selected ?? currentDistrict ?? city)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Пробки и дорожные события в 2ГИС"
                    title="Пробки и дорожные события · 2ГИС"
                  >
                    <Route size={17} />
                    <small>2ГИС</small>
                  </a>
                  <button
                    onClick={() => setIs3D((value) => !value)}
                    className={is3D ? "active" : ""}
                    aria-label={is3D ? "Перейти в 2D" : "Перейти в 3D"}
                  >
                    <Box size={17} />
                    <small>{is3D ? "3D" : "2D"}</small>
                  </button>
                  <span />
                  <button
                    aria-label="Приблизить карту"
                    onClick={() =>
                      fly(
                        selected ?? currentDistrict ?? city,
                        Math.max(400, (focus?.height ?? city.height) * 0.55),
                      )
                    }
                  >
                    <Plus size={19} />
                  </button>
                  <button
                    aria-label="Отдалить карту"
                    onClick={() =>
                      fly(
                        selected ?? currentDistrict ?? city,
                        Math.min(100000, (focus?.height ?? city.height) * 1.8),
                      )
                    }
                  >
                    <Minus size={19} />
                  </button>
                  <span />
                  <button
                    aria-label="Вернуться к Алматы"
                    onClick={() => {
                      setDistrict("all");
                      fly(city, city.height);
                    }}
                  >
                    <LocateFixed size={18} />
                  </button>
                  <button
                    aria-label="Полноэкранная карта"
                    onClick={() => void fullscreen()}
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
                <div className="map-north">
                  <Navigation size={17} />
                  <span>N</span>
                </div>
                <div className="map-caption">
                  <span className="map-caption-line" />
                  <div>
                    <strong>ALMATY</strong>
                    <span>43°14′ N &nbsp; 76°57′ E</span>
                  </div>
                </div>
                <div className="map-legend">
                  <span>
                    <i className="cyan-bg" />
                    Веб-камера
                  </span>
                  <span>
                    <i className="orange-bg" />
                    Событие
                  </span>
                  <span>
                    <i className="blue-bg" />
                    Камера
                  </span>
                  <span>
                    <i className="green-bg" />
                    Патруль
                  </span>
                </div>
                <span className="demo-map-label">DEMO OBJECTS</span>
                {route ? (
                  <div className="route-summary">
                    <Route size={16} />
                    <span>
                      {route.isFallback
                        ? "Прямая линия"
                        : `${route.distanceKm.toFixed(1)} км · ~${route.durationMin} мин`}
                      <small>
                        {route.isFallback
                          ? "Не дорожный маршрут"
                          : "Учебный маршрут · OSRM"}
                      </small>
                    </span>
                    <button
                      aria-label="Убрать маршрут"
                      onClick={() => setRoute(null)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="timeline-panel">
                <div className="timeline-heading">
                  <div>
                    <Clock3 size={14} />
                    <strong>Воспроизведение сценария</strong>
                    <span className="outline-badge">DEMO</span>
                  </div>
                  <button
                    onClick={() => {
                      setTimeline(100);
                      setPlaying(false);
                    }}
                  >
                    К последнему событию <ArrowRight size={12} />
                  </button>
                </div>
                <div className="timeline-controls">
                  <button
                    aria-label={
                      playing
                        ? "Приостановить сценарий"
                        : "Воспроизвести сценарий"
                    }
                    className="play-button"
                    onClick={() => {
                      if (timeline >= 100) setTimeline(0);
                      setPlaying((value) => !value);
                    }}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    className="reset-button"
                    aria-label="Сбросить сценарий"
                    onClick={() => {
                      setTimeline(0);
                      setPlaying(false);
                    }}
                  >
                    <RotateCcw size={15} />
                  </button>
                  <div className="timeline-track">
                    <input
                      aria-label="Прогресс демонстрационного сценария"
                      type="range"
                      min="0"
                      max="100"
                      value={timeline}
                      onChange={(event) => {
                        setTimeline(Number(event.target.value));
                        setPlaying(false);
                      }}
                    />
                    <div className="timeline-labels">
                      <span>Начало</span>
                      <span>Сценарий 01</span>
                      <span>Все события</span>
                    </div>
                  </div>
                  <span className="timeline-percent">{timeline}%</span>
                </div>
              </div>
            </div>
            <aside className="right-panel">
              <div className="feed-heading">
                <div>
                  <Activity size={16} />
                  <strong>
                    {tab === "resources" ? "Ресурсы" : "Лента событий"}
                  </strong>
                  <span>
                    {tab === "resources"
                      ? resourceObjects.length
                      : shownIncidents.length}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Сбросить фильтр событий"
                  onClick={() => setSeverity("all")}
                >
                  <SlidersHorizontal size={15} />
                </button>
              </div>
              {tab !== "resources" ? (
                <div className="feed-filters">
                  {[
                    ["all", "Все"],
                    ["high", "Высокий"],
                    ["medium", "Средний"],
                  ].map(([id, name]) => (
                    <button
                      className={severity === id ? "selected" : ""}
                      key={id}
                      onClick={() => setSeverity(id)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="resource-notice">
                  Публичные камеры и учебные ресурсы
                </div>
              )}
              <div className="event-list">
                {(tab === "resources" ? resourceObjects : shownIncidents).map(
                  (object) => {
                    const Icon = kindIcons[object.kind];
                    return (
                      <button
                        key={object.id}
                        className={`event-row ${selected?.id === object.id ? "selected" : ""}`}
                        onClick={() => selectObject(object)}
                      >
                        <span
                          className={`event-icon ${object.kind === "incident" ? "orange" : object.kind === "webcam" ? "cyan" : object.kind === "camera" ? "blue" : "green"}`}
                        >
                          <Icon size={16} />
                        </span>
                        <span className="event-copy">
                          <span className="event-title">
                            {object.name}
                            <small>
                              {object.updatedAt ||
                                (object.isDemo
                                  ? "DEMO"
                                  : object.kind === "webcam"
                                    ? "PUBLIC"
                                    : "OSM")}
                            </small>
                          </span>
                          <span className="event-address">
                            {object.address || object.district}
                          </span>
                          <span className="event-meta">
                            <span
                              className={`severity ${object.severity === "high" ? "high" : ""}`}
                            >
                              {object.status || kindNames[object.kind]}
                            </span>
                            <span>
                              {object.isDemo
                                ? "Демо"
                                : object.kind === "webcam"
                                  ? "Публично"
                                  : "OSM"}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  },
                )}
                {(tab === "resources"
                  ? resourceObjects.length
                  : shownIncidents.length) === 0 ? (
                  <div className="empty-feed">
                    <Eye size={22} />
                    <p>Нет объектов по этому фильтру</p>
                    <button
                      onClick={() => {
                        changeDistrict("all");
                        setSeverity("all");
                        setTimeline(100);
                      }}
                    >
                      Показать весь город
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="details-card">
                {selected ? (
                  <>
                    <div className="details-heading">
                      <span>ВЫБРАННЫЙ ОБЪЕКТ</span>
                      <button
                        aria-label="Закрыть карточку объекта"
                        onClick={() => {
                          setSelected(null);
                          setRoute(null);
                          routeRequest.current?.abort();
                          setRouteLoading(false);
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="details-kind">
                      <span className="details-symbol">
                        {selected.kind === "camera" ||
                        selected.kind === "webcam" ? (
                          <Camera size={23} />
                        ) : selected.kind === "patrol" ? (
                          <Navigation size={23} />
                        ) : (
                          <MapPin size={23} />
                        )}
                      </span>
                      <span>
                        {kindNames[selected.kind]}
                        <small>
                          {selected.isDemo
                            ? "ДЕМОНСТРАЦИОННЫЙ"
                            : selected.id === "coordinate-search"
                              ? "ВВЕДЕНО ПОЛЬЗОВАТЕЛЕМ"
                              : "ОТКРЫТЫЕ ДАННЫЕ"}
                        </small>
                      </span>
                    </div>
                    <h2>{selected.name}</h2>
                    <p>{selected.description}</p>
                    {selected.kind === "webcam" ? (
                      <button
                        className="primary-button"
                        onClick={() => setCameraOpen(true)}
                      >
                        <Play size={16} /> Смотреть камеры{" "}
                        <ArrowRight size={15} />
                      </button>
                    ) : null}
                    <dl>
                      <div>
                        <dt>Район</dt>
                        <dd>{selected.district}</dd>
                      </div>
                      <div>
                        <dt>
                          {selected.kind === "webcam"
                            ? "Ориентир"
                            : "Координаты"}
                        </dt>
                        <dd className="mono">
                          {selected.latitude.toFixed(4)},{" "}
                          {selected.longitude.toFixed(4)}
                        </dd>
                      </div>
                    </dl>
                    {selected.locationNote ? (
                      <p className="location-note">{selected.locationNote}</p>
                    ) : null}
                    {selected.kind === "camera" ? (
                      <div className="camera-placeholder">
                        <Camera size={25} />
                        <strong>Демонстрационная камера</strong>
                        <span>Видеопоток не подключён</span>
                      </div>
                    ) : null}
                    {selected.sourceUrl ? (
                      <a
                        className="source-link"
                        href={selected.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Посмотреть источник <ArrowUpRight size={13} />
                      </a>
                    ) : null}
                    {nearby &&
                    selected.kind !== "patrol" &&
                    selected.kind !== "webcam" ? (
                      <>
                        <div className="nearest-patrol">
                          <Navigation size={14} />
                          <span>
                            Ближайший demo-патруль
                            <strong>
                              {nearby.patrol.name} ·{" "}
                              {nearby.distanceKm.toFixed(1)} км по прямой
                            </strong>
                          </span>
                        </div>
                        <button
                          className="primary-button"
                          onClick={() => void buildRoute()}
                          disabled={routeLoading}
                        >
                          <Route size={16} />
                          {routeLoading
                            ? "Строим маршрут…"
                            : "Построить маршрут"}
                          <ArrowRight size={15} />
                        </button>
                        <small className="route-note">
                          Визуальный сценарий. Никому не отправляется.
                        </small>
                      </>
                    ) : (
                      <button
                        className="primary-button"
                        onClick={() => fly(selected, 900)}
                      >
                        <Crosshair size={16} />
                        Приблизить объект
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="no-selection">
                    <Crosshair size={27} />
                    <strong>Выберите объект</strong>
                    <p>Нажмите на отметку карты или строку в ленте.</p>
                  </div>
                )}
              </div>
            </aside>
          </section>
          <footer className="page-footer">
            <span>
              <span className="status-dot" />
              {mapStatus}
            </span>
            <span>
              <ShieldCheck size={12} />
              Публичные геоданные + учебные сценарии
            </span>
            <button onClick={() => setInfo(true)}>
              QORGAU VISION <ArrowUpRight size={11} />
            </button>
          </footer>
        </main>
      </div>
      {toast ? (
        <div className="toast" role="status">
          <Radio size={17} />
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      ) : null}
      {sidebarOpen ? (
        <button
          className="sidebar-scrim"
          aria-label="Закрыть боковую панель"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      {info ? (
        <div className="modal-overlay" onClick={() => setInfo(false)}>
          <section
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Закрыть информацию"
              onClick={() => setInfo(false)}
            >
              <X size={20} />
            </button>
            <ShieldCheck size={32} className="green" />
            <span className="eyebrow">QORGAU VISION · ALMATY</span>
            <h2 id="info-title">Городская карта. Открытые данные.</h2>
            <p>
              Первый прототип центра ситуационного обзора Алматы. Проект не
              связан с МВД и не подключён к ведомственным системам.
            </p>
            <div className="info-grid">
              <div>
                <Camera size={20} />
                <strong>Демонстрационные объекты</strong>
                <p>
                  Происшествия, патрули и слой demo-камер вымышлены. Публичные
                  веб-камеры курорта вынесены в отдельный слой.
                </p>
              </div>
              <div>
                <Building2 size={20} />
                <strong>Открытая география</strong>
                <p>
                  Спутник — Esri. Улицы, здания и отметки полиции —
                  OpenStreetMap. Высоты зданий могут быть оценочными.
                </p>
              </div>
            </div>
            <p>
              3D-здания и дорожная сеть включают только центральный фрагмент
              города. Районы — приблизительные точки навигации. Поиск работает
              по встроенным местам и координатам. Дорожный маршрут — OSRM, время
              расчётное и без пробок.
            </p>
            <p>
              Три публичных потока Шымбулака воспроизводятся по нажатию с
              официального источника. Отметка курорта приблизительная. Пробки и
              сообщения о ДТП, работах и перекрытиях открываются в 2ГИС; их
              данные в ленту QORGAU пока не поступают.
            </p>
            <div className="info-links">
              <a
                href="https://github.com/Sshows/Qorgau"
                target="_blank"
                rel="noreferrer"
              >
                Исходный код
                <ArrowUpRight size={13} />
              </a>
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                © OpenStreetMap contributors
              </a>
              <a
                href="https://www.openstreetmap.org/fixthemap"
                target="_blank"
                rel="noreferrer"
              >
                Исправить карту
              </a>
              <a
                href="https://routing.openstreetmap.de/about.html"
                target="_blank"
                rel="noreferrer"
              >
                OSRM / FOSSGIS
              </a>
              <a
                href="https://shymbulak.com/live/"
                target="_blank"
                rel="noreferrer"
              >
                Веб-камеры Шымбулака
              </a>
              <a href={twoGisTrafficUrl()} target="_blank" rel="noreferrer">
                Пробки Алматы · 2ГИС
              </a>
            </div>
            <button className="primary-button" onClick={() => setInfo(false)}>
              Вернуться к карте
              <ArrowRight size={15} />
            </button>
          </section>
        </div>
      ) : null}
      {hubOpen ? (
        <Suspense
          fallback={
            <div className="modal-overlay">
              <section className="search-hub-dialog" role="status">
                Загрузка поиска…
                <button
                  className="modal-close icon-button"
                  onClick={closeHub}
                  aria-label="Закрыть поиск"
                >
                  <X size={20} />
                </button>
              </section>
            </div>
          }
        >
          <SearchHub
            onClose={closeHub}
            onPlace={(point) => {
              setCustomPoint(point);
              setDistrict("all");
              selectObject(point);
              closeHub();
            }}
          />
        </Suspense>
      ) : null}
      {cameraOpen ? (
        <div className="modal-overlay" onClick={() => setCameraOpen(false)}>
          <section
            className="public-camera-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={cameraClose}
              className="modal-close icon-button"
              aria-label="Закрыть веб-камеры"
              onClick={() => setCameraOpen(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow cyan">ПУБЛИЧНЫЕ ВЕБ-КАМЕРЫ · АЛМАТЫ</span>
            <h2 id="camera-title">Шымбулак в прямом эфире</h2>
            <p>
              Выберите вид и нажмите «Подключить трансляцию». Видео загружается
              из публичного источника курорта.
            </p>
            <div className="public-camera-tabs" aria-label="Выбор камеры">
              {publicCameraSources.map((source) => (
                <button
                  key={source.id}
                  aria-pressed={cameraId === source.id}
                  className={cameraId === source.id ? "active" : ""}
                  onClick={() => setCameraId(source.id)}
                >
                  <Camera size={15} />
                  {source.name}
                </button>
              ))}
            </div>
            <CameraBoundary>
              <Suspense
                fallback={
                  <div className="public-camera-loading">Загрузка плеера…</div>
                }
              >
                <PublicCameraPlayer
                  key={activeCamera.id}
                  source={activeCamera}
                />
              </Suspense>
            </CameraBoundary>
            <div className="public-camera-attribution">
              <span>
                Источник: Shymbulak / ipcam.kz · доступность проверена
                09.10.2026
              </span>
              <a
                href="https://shymbulak.com/live/"
                target="_blank"
                rel="noreferrer"
              >
                Сайт курорта <ArrowUpRight size={13} />
              </a>
            </div>
            <div className="public-camera-other">
              <strong>Ещё источники из вашей подборки</strong>
              {additionalCameraLinks.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    {source.name}
                    <small>{source.note}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
export default App;

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Grid2X2,
  Heart,
  List,
  MapPin,
  Maximize2,
  MonitorPlay,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  VideoOff,
} from "lucide-react";
import { cameraPreviewUrl, cameraStreamLabel, cameraStreamLabels } from "./cameraCatalog";
import { cameraTypes, cameraStatuses, displayTime } from "./operations";
import type { CameraRecord } from "./operations";
import { CameraForm, Select } from "./OperationForms";
import OperationsMap from "./OperationsMap";
import "./camera-center.css";

const Player = lazy(() => import("./PublicCameraPlayer"));
export type PlaybackChecks = Record<
  string,
  { status: string; checked_at: string; url: string }
>;
type CatalogState = {
  query: string;
  city: string;
  stream: string;
  favorites: boolean;
  district: string;
  type: string;
  status: string;
  sort: string;
  view: string;
  page: number;
};
const catalogueKey = "qorgau-camera-catalogue-v4";
const initialCatalogue: CatalogState = {
  query: "",
  city: "",
  stream: "",
  favorites: false,
  district: "",
  type: "",
  status: "",
  sort: "city",
  view: "grid",
  page: 0,
};
function readCatalogue(): CatalogState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(catalogueKey) || "null");
    if (!saved || typeof saved !== "object") return { ...initialCatalogue };
    return {
      ...initialCatalogue,
      ...Object.fromEntries(
        Object.keys(initialCatalogue).map((key) => [
          key,
          typeof saved[key] ===
          typeof initialCatalogue[key as keyof CatalogState]
            ? saved[key]
            : initialCatalogue[key as keyof CatalogState],
        ]),
      ),
    };
  } catch {
    return { ...initialCatalogue };
  }
}
const favoritesKey = "qorgau-camera-favorites-v1";
function readFavorites(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
  } catch { return []; }
}
function statusClass(status: string) {
  return status === "Доступна"
    ? "available"
    : status === "Недоступна"
      ? "unavailable"
      : status === "Отключена"
        ? "disabled"
        : "unknown";
}
function CameraArtwork({ index, title, camera }: { index: number; title: string; camera: CameraRecord }) {
  const preview = cameraPreviewUrl(camera);
  const [failedPreview, setFailedPreview] = useState<string | undefined>();
  const hasPreview = Boolean(preview && failedPreview !== preview);
  return (
    <div className={`cv-art cv-art-${index % 3}`} aria-hidden="true">
      {hasPreview && <img className="cv-source-preview" src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedPreview(preview)} />}
      {!hasPreview && <svg viewBox="0 0 600 260" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`cv-mountain-${index}`} x2="0" y2="1">
            <stop stopColor="#1d7c9f" stopOpacity=".3" />
            <stop offset="1" stopColor="#122c43" />
          </linearGradient>
        </defs>
        <path
          d="M0 250 110 132 155 168 270 35 350 140 400 107 600 260Z"
          fill={`url(#cv-mountain-${index})`}
        />
        <path
          d="m145 185 125-150 74 96-63-39-24 30-16-21Z"
          fill="#8ac4d5"
          opacity=".17"
        />
        <path
          d="M0 235 90 194 148 222 214 169 280 213 354 165 420 199 520 155 600 211"
          fill="none"
          stroke="#2c6f84"
        />
        <path
          d="m0 250 150-27 150 24 150-22 150 26M300 260V90"
          fill="none"
          stroke="#2c657b"
          strokeDasharray="4 7"
          opacity=".6"
        />
        <circle
          cx="300"
          cy="133"
          r="53"
          fill="none"
          stroke="#62c9e4"
          opacity=".08"
        />
        <circle
          cx="300"
          cy="133"
          r="79"
          fill="none"
          stroke="#62c9e4"
          opacity=".06"
        />
      </svg>}
      <div className="cv-art-caption">
        <span>QORGAU / PUBLIC SOURCE</span>
        <strong>{title}</strong>
        <small>{hasPreview ? "Кадр источника · не проверка эфира" : "Предпросмотр не загружен · нажмите для проверки"}</small>
      </div>
      <span className="cv-play">
        <Play size={21} fill="currentColor" />
      </span>
    </div>
  );
}
export default function CameraCenter({
  cameras,
  canAdmin,
  saveCamera,
  checks,
  onCheck,
  initialStatus,
  initialDistrict,
  initialCameraId,
  navigationToken,
  onNavigateMap,
}: {
  cameras: CameraRecord[];
  canAdmin: boolean;
  saveCamera: (
    c: Omit<CameraRecord, "id" | "checked_at">,
    existing?: CameraRecord,
  ) => Promise<unknown>;
  checks: PlaybackChecks;
  onCheck: (id: string, url: string, status: string) => void;
  initialStatus?: string;
  initialDistrict?: string;
  initialCameraId?: string;
  navigationToken?: number;
  onNavigateMap?: (camera: CameraRecord) => void;
}) {
  const [catalogue, setCatalogue] = useState<CatalogState>(() => ({
    ...readCatalogue(),
    ...(initialStatus !== undefined
      ? {
          status: initialStatus,
          query: "",
          city: "",
          stream: "",
          favorites: false,
          type: "",
          district: initialDistrict || "",
          page: 0,
        }
      : {}),
    ...(initialDistrict !== undefined
      ? { district: initialDistrict, page: 0 }
      : {}),
  }));
  const [activeId, setActiveId] = useState<string | null>(
    initialCameraId || null,
  );
  const [edit, setEdit] = useState<CameraRecord | "new" | null>(null);
  const [wall, setWall] = useState<string[]>([]);
  const [coordinateList, setCoordinateList] = useState(false);
  const [favorites, setFavorites] = useState(readFavorites);
  const [largePlayer, setLargePlayer] = useState(false);
  useEffect(() => { try { localStorage.setItem(favoritesKey, JSON.stringify(favorites)); } catch { /* Favorites still work for this session. */ } }, [favorites]);
  function toggleFavorite(id: string) { setFavorites((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  const previousToken = useRef(navigationToken);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      sessionStorage.setItem(catalogueKey, JSON.stringify(catalogue));
    } catch {
      /* A blocked storage area does not prevent using the catalogue. */
    }
  }, [catalogue]);
  useEffect(() => {
    if (previousToken.current === navigationToken) return;
    previousToken.current = navigationToken;
    if (initialStatus !== undefined || initialDistrict !== undefined)
      setCatalogue((c) => ({
        ...c,
        query: "",
        city: "",
        stream: "",
        favorites: false,
        type: "",
        status: initialStatus || "",
        district: initialDistrict || "",
        page: 0,
      }));
    setActiveId(initialCameraId || null);
  }, [navigationToken, initialStatus, initialDistrict, initialCameraId]);
  const active = cameras.find((c) => c.id === activeId);
  function update(patch: Partial<CatalogState>) {
    setCatalogue((c) => ({ ...c, ...patch, page: patch.page ?? 0 }));
  }
  function checked(c: CameraRecord) {
    return c.status === "Отключена"
      ? { status: c.status, checked_at: c.checked_at }
      : checks[c.id]?.url === c.stream_url
        ? checks[c.id]
        : c;
  }
  const statusCounts = Object.fromEntries(
    cameraStatuses.map((s) => [
      s,
      cameras.filter((c) => checked(c).status === s).length,
    ]),
  );
  const cities = [...new Set(cameras.map((c) => c.city || "Алматы"))];
  const districtOptions = [...new Set(cameras.filter((c) => !catalogue.city || (c.city || "Алматы") === catalogue.city).map((c) => c.district).filter(Boolean))];
  const filtered = cameras
    .filter(
      (c) =>
        (!catalogue.query.trim() ||
          `${c.name} ${c.address} ${c.district} ${c.city || "Алматы"}`
            .toLocaleLowerCase("ru")
            .includes(catalogue.query.trim().toLocaleLowerCase("ru"))) &&
        (!catalogue.city || (c.city || "Алматы") === catalogue.city) &&
        (!catalogue.stream || (c.stream_type || "hls") === catalogue.stream) &&
        (!catalogue.favorites || favorites.includes(c.id)) &&
        (!catalogue.district || c.district === catalogue.district) &&
        (!catalogue.type || c.type === catalogue.type) &&
        (!catalogue.status || checked(c).status === catalogue.status),
    )
    .sort((a, b) => {
      if (catalogue.sort === "city") {
        const rank = (c: CameraRecord) => c.city === "Алматы" || !c.city ? 0 : c.city === "Алматинская область" ? 1 : c.city === "Актау" ? 2 : 3;
        return rank(a) - rank(b) || (a.city || "Алматы").localeCompare(b.city || "Алматы", "ru") || a.name.localeCompare(b.name, "ru");
      }
      const value = (c: CameraRecord) => catalogue.sort === "status" ? checked(c).status : c[catalogue.sort === "district" ? "district" : "name"];
      return value(a).localeCompare(value(b), "ru");
    });
  const currentPage = Math.max(
    0,
    Math.min(catalogue.page, Math.ceil(filtered.length / 12) - 1),
  );
  const visible = filtered.slice(currentPage * 12, currentPage * 12 + 12);
  const mapped = filtered.filter(
    (c) => c.latitude !== null && c.longitude !== null,
  ).length;
  function open(c: CameraRecord) {
    setActiveId(c.id);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function player(c: CameraRecord) {
    return c.status === "Отключена" ? (
      <div className="cv-player-disabled">
        <VideoOff size={34} />
        <h3>Просмотр отключён</h3>
        <p>Камера отключена администратором. Проверьте первоисточник.</p>
        <a href={c.source_url} target="_blank" rel="noopener noreferrer">
          Открыть источник <ExternalLink size={15} />
        </a>
      </div>
    ) : (
      <Suspense
        fallback={<div className="op-skeleton">Загрузка видеоплеера…</div>}
      >
        <Player
          key={c.id}
          source={{
            id: c.id,
            name: c.name,
            sourceUrl: c.source_url,
            streamUrl: c.stream_url,
            streamType: c.stream_type,
            embedAllowed: c.embed_allowed,
          }}
          onPlayback={(s) => onCheck(c.id, c.stream_url, s)}
        />
      </Suspense>
    );
  }
  const sequence = active && filtered.some((c) => c.id === active.id) ? filtered : cameras;
  const activeIndex = sequence.findIndex((c) => c.id === activeId);
  const nextCamera = sequence.length > 1 ? sequence[(activeIndex + 1) % sequence.length] : null;
  const editor = edit && (
    <CameraForm
      existing={edit === "new" ? undefined : edit}
      onSave={(value) => saveCamera(value, edit === "new" ? undefined : edit)}
      onClose={() => setEdit(null)}
    />
  );
  if (active)
    return (
      <div className={`cv-page cv-detail ${largePlayer ? "cv-detail-expanded" : ""}`} ref={topRef}>
        <nav className="cv-breadcrumb" aria-label="Камера: хлебные крошки">
          <button onClick={() => setActiveId(null)}>Видеонаблюдение</button>
          <ChevronRight size={14} />
          <span>{active.name}</span>
        </nav>
        <div className="cv-detail-heading">
          <button className="cv-back" onClick={() => setActiveId(null)}>
            <ArrowLeft size={17} />К каталогу
          </button>
          <div>
            <span className="cv-kicker">ПУБЛИЧНЫЙ ИСТОЧНИК / {(active.city || "Алматы").toLocaleUpperCase("ru")}</span>
            <h1>{active.name}</h1>
            <p>
              <MapPin size={14} />
              {active.city || "Алматы"} · {active.address}{active.district ? ` · ${active.district}` : ""}
            </p>
          </div>
          <span className={`cv-status ${statusClass(checked(active).status)}`}>
            <i />
            {checked(active).status}
          </span>
        </div>
        <div className="cv-detail-tools">
          <button className="cv-secondary" aria-pressed={favorites.includes(active.id)} onClick={() => toggleFavorite(active.id)}><Heart size={15} fill={favorites.includes(active.id) ? "currentColor" : "none"} />{favorites.includes(active.id) ? "В избранном" : "В избранное"}</button>
          <button className="cv-secondary" aria-pressed={largePlayer} onClick={() => setLargePlayer((v) => !v)}><Maximize2 size={15} />{largePlayer ? "Обычный размер" : "Большой плеер"}</button>
          {nextCamera && <button className="cv-secondary" onClick={() => open(nextCamera)}>Следующая камера <ChevronRight size={15} /></button>}
          <span>{cameraStreamLabel(active)}</span>
        </div>
        <div className="cv-detail-layout">
          <section className="cv-viewer">
            <div className="cv-panel-header">
              <h3>
                <MonitorPlay size={17} />
                Просмотр источника
              </h3>
              <span>ПОДКЛЮЧЕНИЕ ПО ЗАПРОСУ</span>
            </div>
            {player(active)}
            <div className="cv-player-footer">
              <CircleHelp size={15} />
              <span>
                {active.stream_type === "image" ? "Статус подтверждает загрузку изображения, а не свежесть кадра или прямой эфир." : active.stream_type === "youtube" ? "Внешний плеер управляется YouTube. Проверка открытия iframe не подтверждает воспроизведение." : "Статус подтверждается фактическим воспроизведением видео в этом браузере."}
              </span>
            </div>
          </section>
          <aside className="cv-information">
            <div className="cv-panel-header">
              <h3>Паспорт камеры</h3>
              <Camera size={17} />
            </div>
            <dl>
              <dt>Город</dt>
              <dd>{active.city || "Алматы"}</dd>
              <dt>Район</dt>
              <dd>{active.district || "Не указан источником"}</dd>
              <dt>Тип</dt>
              <dd>{active.type}</dd>
              <dt>Формат</dt>
              <dd>{cameraStreamLabel(active)}</dd>
              <dt>Координаты каталога</dt>
              <dd>
                {active.latitude === null || active.longitude === null
                  ? "Не подтверждены"
                  : `${active.latitude}, ${active.longitude}`}
              </dd>
              <dt>Последняя проверка в браузере</dt>
              <dd>{displayTime(checked(active).checked_at)}</dd>
              <dt>Проверка HTTP источника</dt>
              <dd>{displayTime(active.transport_checked_at || null)}</dd>
              <dt>Основание статуса</dt>
              <dd>
                {checked(active).status === "Доступна"
                  ? active.stream_type === "image" ? "Изображение успешно загружено в текущей сессии. Время съёмки не подтверждено." : "Плеер подтвердил воспроизведение в текущей сессии."
                  : checked(active).status === "Недоступна"
                    ? "Плеер сообщил об ошибке подключения. Причину уточняйте у владельца источника."
                    : checked(active).status === "Отключена"
                      ? "Просмотр отключён в каталоге администратором."
                      : "Воспроизведение ещё не проверялось в этой сессии."}
              </dd>
            </dl>
            {active.catalog_status && <p className="cv-source-evidence">{active.catalog_status}</p>}
            <p className="cv-coordinate-note">
              <MapPin size={15} />
              {active.location_note ||
                "Дополнительные сведения о месте установки отсутствуют."}
            </p>
            <a
              className="cv-source-button"
              href={active.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Страница источника <ExternalLink size={15} />
            </a>
            {onNavigateMap && active.latitude !== null && active.longitude !== null && (
              <button
                className="cv-secondary"
                onClick={() => onNavigateMap(active)}
              >
                <MapPin size={16} />
                {active.latitude === null
                  ? "Место не подтверждено"
                  : "Показать камеру на карте"}
              </button>
            )}
            {canAdmin && (
              <button className="cv-secondary" onClick={() => setEdit(active)}>
                <Settings2 size={16} />
                Настройки камеры
              </button>
            )}
          </aside>
        </div>
        <section className="cv-related">
          <div className="cv-panel-header">
            <h3>Другие камеры каталога</h3>
            <span>{cameras.length - 1}</span>
          </div>
          <div>
            {cameras
              .filter((c) => c.id !== active.id)
              .slice(0, 4)
              .map((c) => (
                <button key={c.id} onClick={() => open(c)}>
                  <Camera size={18} />
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.city || "Алматы"} · {cameraStreamLabel(c)}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
          </div>
        </section>
        {editor}
      </div>
    );
  return (
    <div className="cv-page" ref={topRef}>
      {canAdmin && (
        <div className="cv-heading">
          <div>
            <span className="cv-kicker">КАТАЛОГ КАМЕР</span>
            <h1>
              <Camera size={22} />
              Видеонаблюдение{" "}
              <span className="cv-live-label">УПРАВЛЕНИЕ</span>
            </h1>
            <p>Алматы, область и города Казахстана · публичные видео и снимки</p>
          </div>
          <button className="op-primary" onClick={() => setEdit("new")}>
            <Plus size={16} />
            Добавить камеру
          </button>
        </div>
      )}
      <div className="cv-filter-bar">
        <label className="op-field cv-search">
          <span>Поиск</span>
          <input
            value={catalogue.query}
            placeholder="Название, адрес или ориентир…"
            onChange={(e) => update({ query: e.target.value })}
          />
        </label>
        <Select
          label="Город / регион"
          value={catalogue.city}
          onChange={(city) => update({ city, district: "" })}
          options={cities}
          all="Все регионы"
        />
        <Select
          label="Район"
          value={catalogue.district}
          onChange={(district) => update({ district })}
          options={districtOptions}
          all="Все районы"
        />
        <Select
          label="Тип"
          value={catalogue.type}
          onChange={(type) => update({ type })}
          options={cameraTypes}
          all="Все типы"
        />
        <label className="op-field">
          <span>Формат</span>
          <select
            value={catalogue.stream}
            onChange={(e) => update({ stream: e.target.value })}
          >
            <option value="">Все форматы</option>
            {Object.entries(cameraStreamLabels).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="cv-reset"
          onClick={() => setCatalogue({ ...initialCatalogue })}
        >
          <RotateCcw size={14} />
          <span>Сброс</span>
        </button>
      </div>
      <div className="cv-summary">
        <button
          aria-pressed={catalogue.status === ""}
          onClick={() => update({ status: "" })}
        >
          <Camera size={15} />
          <strong>{cameras.length}</strong>
          <span>все</span>
        </button>
        <button
          className="available"
          aria-pressed={catalogue.status === "Доступна"}
          onClick={() =>
            update({
              status: catalogue.status === "Доступна" ? "" : "Доступна",
            })
          }
        >
          <i />
          <strong>{statusCounts["Доступна"]}</strong>
          <span>доступно</span>
        </button>
        <button
          className="unavailable"
          aria-pressed={catalogue.status === "Недоступна"}
          onClick={() =>
            update({
              status: catalogue.status === "Недоступна" ? "" : "Недоступна",
            })
          }
        >
          <i />
          <strong>{statusCounts["Недоступна"]}</strong>
          <span>недоступно</span>
        </button>
        <button
          className="unknown"
          aria-pressed={catalogue.status === "Не проверена"}
          onClick={() =>
            update({
              status: catalogue.status === "Не проверена" ? "" : "Не проверена",
            })
          }
        >
          <i />
          <strong>{statusCounts["Не проверена"]}</strong>
          <span>ожидают проверки</span>
        </button>
        <button
          className="cv-favorites-filter"
          aria-pressed={catalogue.favorites}
          onClick={() => update({ favorites: !catalogue.favorites })}
        >
          <Heart
            size={14}
            fill={catalogue.favorites ? "currentColor" : "none"}
          />
          <span>
            Избранные ({cameras.filter((c) => favorites.includes(c.id)).length})
          </span>
        </button>
      </div>
      <div
        className={`cv-catalogue-layout ${catalogue.view === "map" ? "map-only" : "full-catalog"}`}
      >
        <section className="cv-results">
          <div className="cv-results-heading">
            <span>
              Найдено: <strong>{filtered.length}</strong>
            </span>
            <div className="cv-toolbar-right">
              <label className="cv-sort-inline">
                <select
                  aria-label="Сортировка камер"
                  value={catalogue.sort}
                  onChange={(e) => update({ sort: e.target.value })}
                >
                  <option value="city">Сначала Алматы</option>
                  <option value="name">По названию</option>
                  <option value="district">По району</option>
                  <option value="status">По статусу</option>
                </select>
              </label>
              <div className="cv-view-switch" aria-label="Вид каталога">
                {[
                  ["grid", "Сетка", Grid2X2],
                  ["list", "Список", List],
                  ["wall", "Видеостена", MonitorPlay],
                  ["map", "Карта", MapPin],
                ].map(([id, name, Icon]) => {
                  const I = Icon as typeof Camera;
                  return (
                    <button
                      key={String(id)}
                      aria-label={String(name)}
                      title={String(name)}
                      aria-pressed={catalogue.view === id}
                      onClick={() =>
                        update({ view: String(id), page: catalogue.page })
                      }
                    >
                      <I size={15} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {catalogue.view === "wall" && (
            <div className="cv-wall-intro">
              <MonitorPlay size={20} />
              <div>
                <strong>Соберите видеостену</strong>
                <span>
                  Выберите до четырёх камер. Каждый поток подключается отдельно.
                </span>
              </div>
              <b>
                {wall.filter((id) => filtered.some((c) => c.id === id)).length}
                /4
              </b>
            </div>
          )}
          <div
            className={`cv-grid ${catalogue.view === "list" || catalogue.view === "map" ? "cv-list" : ""}`}
          >
            {visible.map((c, index) => (
              <article className="cv-card" key={c.id}>
                <button
                  className="cv-card-preview"
                  aria-label={`Смотреть ${c.name}`}
                  onClick={() => open(c)}
                >
                  <CameraArtwork index={index} title={c.name} camera={c} />
                  <span
                    className={`cv-status ${statusClass(checked(c).status)}`}
                  >
                    <i />
                    {checked(c).status}
                  </span>
                  <span className="cv-stream-type">
                    {c.is_demo ? "DEMO" : cameraStreamLabel(c)}
                  </span>
                </button>
                <div className="cv-card-body">
                  <div className="cv-card-title">
                    <button onClick={() => open(c)}>
                      {c.name}
                      <ArrowUpRight size={14} />
                    </button>
                    <button className="cv-icon-button cv-favorite" aria-label={favorites.includes(c.id) ? "Убрать " + c.name + " из избранного" : "Добавить " + c.name + " в избранное"} aria-pressed={favorites.includes(c.id)} onClick={() => toggleFavorite(c.id)}><Heart size={15} fill={favorites.includes(c.id) ? "currentColor" : "none"} /></button>
                    {canAdmin && (
                      <button
                        className="cv-icon-button"
                        aria-label={`Настройки ${c.name}`}
                        onClick={() => setEdit(c)}
                      >
                        <Settings2 size={15} />
                      </button>
                    )}
                  </div>
                  <p>
                    <MapPin size={12} />
                    {c.address}
                  </p>
                  <div className="cv-card-meta">
                    <span>{c.city || "Алматы"}{c.district ? ` · ${c.district}` : ""}</span>
                    <span>
                      <Camera size={12} />
                      {c.type}
                    </span>
                  </div>
                  <div className="cv-check-row">
                    <Radio size={12} />
                    <span>
                      {checked(c).checked_at
                        ? `Проверено: ${displayTime(checked(c).checked_at)}`
                        : "Ещё не проверялась в этой сессии"}
                    </span>
                  </div>
                  {catalogue.view === "wall" && (
                    <label className="cv-wall-check">
                      <input
                        type="checkbox"
                        checked={wall.includes(c.id)}
                        disabled={!wall.includes(c.id) && wall.length >= 4}
                        onChange={() =>
                          setWall((w) =>
                            w.includes(c.id)
                              ? w.filter((id) => id !== c.id)
                              : [...w, c.id],
                          )
                        }
                      />
                      <span>
                        <Check size={13} />
                        На видеостену
                      </span>
                    </label>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <div className="cv-empty">
              <Camera size={36} />
              <h3>Камеры не найдены</h3>
              <p>
                В каталоге нет камер с такими параметрами. Измените район,
                статус или поисковый запрос.
              </p>
              <button
                className="cv-source-button"
                onClick={() => setCatalogue({ ...initialCatalogue })}
              >
                Сбросить фильтры
              </button>
            </div>
          )}
          <div className="cv-pagination">
            <span>
              {filtered.length
                ? `${currentPage * 12 + 1}–${Math.min((currentPage + 1) * 12, filtered.length)} из ${filtered.length}`
                : "0"}{" "}
              камер
            </span>
            {filtered.length > 12 && (
              <div>
                <button
                  disabled={currentPage === 0}
                  onClick={() => update({ page: currentPage - 1 })}
                >
                  ← Назад
                </button>
                <span>
                  {currentPage + 1} / {Math.ceil(filtered.length / 12)}
                </span>
                <button
                  disabled={(currentPage + 1) * 12 >= filtered.length}
                  onClick={() => update({ page: currentPage + 1 })}
                >
                  Далее →
                </button>
              </div>
            )}
            <span>{mapped} с координатами на карте</span>
          </div>
        </section>
        {catalogue.view === "map" && (
          <aside className="cv-map-panel">
            <div className="cv-panel-header">
              <h3>
                <MapPin size={17} />
                Карта камер
              </h3>
              <button
                aria-label="Вернуться к сетке камер"
                onClick={() => update({ view: "grid" })}
              >
                <Maximize2 size={15} />
              </button>
            </div>
            <OperationsMap
              cameras={filtered.map((c) => ({ ...c, ...checked(c) }))}
              events={[]}
              compact
              district={catalogue.district}
              onCameraSelect={open}
            />
            <div className="cv-map-legend">
              <span>
                <i className="available" />
                Доступна
              </span>
              <span>
                <i className="unavailable" />
                Недоступна
              </span>
              <span>
                <i className="unknown" />
                Не проверена
              </span>
            </div>
            <button
              className="cv-coordinate-disclosure"
              onClick={() => setCoordinateList((v) => !v)}
              aria-expanded={coordinateList}
            >
              <CircleHelp size={15} />
              <span>
                {mapped} из {filtered.length} с опубликованными координатами
              </span>
              <ChevronRight size={14} />
            </button>
            {coordinateList && (
              <div className="cv-coordinate-explanation">
                <p>
                  На карте используются опубликованные источником координаты с атрибуцией в паспорте камеры. Для остальных камер положение не выдумывается; общий ориентир курорта не заменяет место установки.
                </p>
                {filtered
                  .filter((c) => c.latitude === null || c.longitude === null)
                  .map((c) => (
                    <button key={c.id} onClick={() => open(c)}>
                      {c.name}
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
              </div>
            )}
            <p className="cv-map-note">
              Район в фильтре меняет и каталог, и карту. Точки с неподтверждённым
              положением не добавляются.
            </p>
          </aside>
        )}
      </div>
      {catalogue.view === "wall" && (
        <section className="cv-wall-section">
          <div className="cv-panel-header">
            <h3>
              <MonitorPlay size={17} />
              Видеостена
            </h3>
            <span>
              {wall.filter((id) => filtered.some((c) => c.id === id)).length}{" "}
              выбрано
            </span>
          </div>
          {!wall.some((id) => filtered.some((c) => c.id === id)) ? (
            <div className="cv-wall-empty">
              Отметьте камеры в каталоге выше, чтобы разместить здесь потоки.
            </div>
          ) : (
            <div className="cv-wall-grid">
              {filtered
                .filter((c) => wall.includes(c.id))
                .map((c) => (
                  <article key={c.id}>
                    <div className="cv-panel-header">
                      <button onClick={() => open(c)}>
                        {c.name}
                        <ArrowUpRight size={14} />
                      </button>
                      <button
                        aria-label={`Убрать ${c.name} с видеостены`}
                        onClick={() =>
                          setWall((w) => w.filter((id) => id !== c.id))
                        }
                      >
                        Убрать
                      </button>
                    </div>
                    {player(c)}
                  </article>
                ))}
            </div>
          )}
        </section>
      )}
      <div className="cv-catalogue-note">
        <CircleHelp size={15} />
        <p>
          Источников в каталоге: {cameras.length}. «Не проверена» означает
          отсутствие проверки воспроизведения, а не недоступность. Фонового
          мониторинга нет. Доступность и содержание видео определяет владелец
          трансляции.
        </p>
      </div>
      <details className="cv-external-sources">
        <summary>
          <ExternalLink size={16} />
          <span>
            Первоисточники и каталоги
            <small>
              Проверенные ссылки и ограничения покрытия
            </small>
          </span>
          <ChevronRight size={16} />
        </summary>
        <div className="cv-external-grid">
          <section>
            <h3>Алматы</h3>
            <a
              href="https://www.youtube.com/watch?v=MmlDKqnfEpY"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>Вершины из окна</strong>
                <small>Запись недоступна у YouTube · исключена из каталога</small>
              </span>
              <ExternalLink size={15} />
            </a>
          </section>
          <section>
            <h3>Алматинская область</h3>
            <a
              href="https://oiqaragai.com/ru/live"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>Oi-Qaragai</strong>
                <small>Официальный каталог · просмотр не проверен</small>
              </span>
              <ExternalLink size={15} />
            </a>
          </section>
          <section>
            <h3>Другие города Казахстана</h3>
            <a
              href="https://pocketworld.org/ru/webcams/country/kz"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>Актау · XCOM / PocketWorld</strong>
                <small>
                  Конкретные HLS-камеры добавлены в каталог; доступны отдельным городом
                </small>
              </span>
              <ExternalLink size={15} />
            </a>
          </section>
          <section>
            <h3>Публичные метаданные</h3>
            <a
              href="https://osirisai.live/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>OSIRIS AI</strong>
                <small>
                  Каталог использован для поиска конкретных публичных URL
                </small>
              </span>
              <ExternalLink size={15} />
            </a>
          </section>
        </div>
        <p>
          Показатели считают конкретные записи каталога, а не ссылки на страницы. Доступный манифест или снимок не подтверждают прямой эфир. Каталоги могут ошибаться в географии; камеры других городов отделены фильтром.
        </p>
      </details>
      {editor}
    </div>
  );
}

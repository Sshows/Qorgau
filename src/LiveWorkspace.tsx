import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Map,
  Camera,
  TriangleAlert,
  ChartNoAxesCombined,
  FileText,
  Sparkles,
  Settings,
  RefreshCw,
  Menu,
  ArrowUpRight,
  Search,
  Database,
  Clock3,
  MapPin,
  Download,
  X,
  ChevronRight,
  Radio,
  FlaskConical,
} from "lucide-react";
import OperationsMap from "./OperationsMap";
import CameraCenter from "./CameraCenter";
import type { PlaybackChecks } from "./CameraCenter";
import { verifiedCameraCatalog } from "./cameraCatalog";
import type { CameraRecord } from "./operations";
import { displayTime, downloadFile } from "./operations";
import { useLiveData } from "./useLiveData";
import { eventHasCoordinates, liveEventDate } from "./liveData";
import type { LiveEvent, LiveDataSnapshot } from "./liveData";
import { filterLiveEvents, groupLive, liveCsv } from "./livePresentation";
import PublicAiPanel from "./PublicAiPanel";
import { parseRoute, routeHash } from "./navigation";
import type { Page } from "./navigation";
import "./operations.css";
import "./workspace.css";
import "./live-workspace.css";
const navigation = [
  ["overview", "Обзор", LayoutDashboard],
  ["map", "Карта", Map],
  ["events", "Происшествия", TriangleAlert],
  ["cameras", "Видеонаблюдение", Camera],
  ["analytics", "Аналитика", ChartNoAxesCombined],
  ["reports", "Отчёты", FileText],
  ["ai", "QORGAU AI", Sparkles],
  ["settings", "Источники и настройки", Settings],
] as const;
const subtitles: Record<string, string> = {
  overview: "Сводка открытых источников по Алматы и Казахстану",
  map: "Интерактивная карта событий и камер с координатами",
  events: "Лента официальных публикаций и сообщений служб",
  cameras: "Публичные видеопотоки и обновляемые кадры",
  analytics: "Статистика по текущему снимку источников",
  reports: "Выгрузка публикаций в CSV и JSON",
  ai: "Анализ обстановки по данным открытых источников",
  settings: "Статус подключения и расписание обновления",
};
export default function LiveWorkspace({ onDemo }: { onDemo: () => void }) {
  const { snapshot, busy, error, ai, refresh } = useLiveData();
  const [route, setRoute] = useState(() => parseRoute(location.hash)),
    [navigationRevision, setNavigationRevision] = useState(0),
    [menu, setMenu] = useState(false),
    [checks, setChecks] = useState<PlaybackChecks>({}),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [scope, setScope] = useState("all"),
    [freshness, setFreshness] = useState("all"),
    [eventPage, setEventPage] = useState(0),
    [detail, setDetail] = useState<LiveEvent | null>(null),
    [district, setDistrict] = useState("");
  const page = route.page === "lab" ? "settings" : route.page;
  useEffect(() => {
    if (!detail) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [detail]);
  useEffect(() => {
    const change = () => {
      setRoute(parseRoute(location.hash));
      setNavigationRevision((v) => v + 1);
      setMenu(false);
      setDetail(null);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  const go = (p: Page, params: Record<string, string> = {}) => {
    location.hash = routeHash(p, params);
    setMenu(false);
  };
  const onCheck = useCallback(
    (id: string, url: string, status: string) =>
      setChecks((c) => ({
        ...c,
        [id]: { status, url, checked_at: new Date().toISOString() },
      })),
    [],
  );
  const filtered = useMemo(
    () => filterLiveEvents(snapshot.events, query, category, scope, freshness),
    [snapshot.events, query, category, scope, freshness],
  );
  const categories = useMemo(
    () => [...new Set(snapshot.events.map((e) => e.category))].sort(),
    [snapshot.events],
  );
  const recent = snapshot.events.filter((e) => e.status === "recent"),
    located = snapshot.events.filter(eventHasCoordinates),
    sourcesOk = snapshot.sources.filter((s) => s.status === "ok").length,
    playing = Object.values(checks).filter(
      (c) => c.status === "Доступна",
    ).length;
  const openCamera = (c: CameraRecord) => go("cameras", { camera: c.id });
  const openMap = (c: CameraRecord) =>
    go("map", {
      camera: c.id,
      ...(c.latitude !== null && c.longitude !== null
        ? { latitude: String(c.latitude), longitude: String(c.longitude) }
        : {}),
    });
  const latitude = Number(route.params.get("latitude")),
    longitude = Number(route.params.get("longitude"));
  const focus =
    route.params.has("latitude") &&
    route.params.has("longitude") &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
      ? { latitude, longitude }
      : undefined;
  const map =
    page === "overview" || page === "map" ? (
      <OperationsMap
        compact={page === "overview"}
        events={[]}
        liveEvents={snapshot.events}
        cameras={verifiedCameraCatalog}
        workingMode="real"
        district={district}
        onDistrictChange={setDistrict}
        onLiveEventSelect={setDetail}
        onCameraSelect={openCamera}
        selectedCameraId={route.params.get("camera") ?? undefined}
        focusPoint={focus}
      />
    ) : null;
  const pageNo = Math.min(
    eventPage,
    Math.max(0, Math.ceil(filtered.length / 20) - 1),
  );
  const exportCsv = () =>
    downloadFile(
      liveCsv(filtered),
      "qorgau-publications.csv",
      "text/csv;charset=utf-8",
    );
  return (
    <div
      className={`op-workspace live-workspace ${menu ? "live-menu-open" : ""}`}
    >
      <aside className="live-sidebar">
        <a className="live-brand" href="#overview">
          <span>
            <ShieldCheck size={30} />
          </span>
          <div>
            QORGAU<small>VISION</small>
          </div>
        </a>
        <div className="live-location">
          <MapPin size={12} />
          АЛМАТЫ <span>KZ</span>
        </div>
        <nav aria-label="Основная навигация">
          {navigation.map(([id, label, Icon]) => (
            <a
              href={routeHash(id)}
              className={page === id ? "active" : ""}
              key={id}
            >
              <Icon size={18} />
              <span>{label}</span>
              {page === id && <i />}
            </a>
          ))}
        </nav>
        <div className="live-sidebar-bottom">
          <div>
            <Radio size={14} />
            <span>
              Открытые источники<small>Прототип ситуационного центра</small>
            </span>
          </div>
          <button onClick={onDemo}>
            <FlaskConical size={15} />
            Открыть учебный DEMO
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="live-menu-scrim"
          aria-label="Закрыть навигацию"
          onClick={() => setMenu(false)}
        />
      )}
      <main className="live-main">
        <header className="live-topbar">
          <button
            className="live-menu-button"
            aria-label="Открыть навигацию"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="live-breadcrumb">
            Ситуационный центр <ChevronRight size={13} />
            <strong>Алматы</strong>
          </div>
          <div className="live-topbar-right">
            <span className="live-state ok">
              <i />
              Публичные данные
            </span>
            <span className="live-time">
              {snapshot.generatedAt
                ? displayTime(snapshot.generatedAt)
                : "Подключаем источники"}
            </span>
            <button
              className="live-refresh"
              title="Проверить обновление источников"
              aria-label="Обновить источники"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} className={busy ? "live-spin" : ""} />
            </button>
          </div>
        </header>
        <div className="live-content">
          <div className="live-page-heading">
            <div>
              <span className="live-eyebrow">Ситуационный центр · Алматы</span>
              <h1>{navigation.find((n) => n[0] === page)?.[1]}</h1>
              <p>{subtitles[page]}</p>
            </div>
            <button className="op-button" onClick={() => go("settings")}>
              <Database size={14} />
              {sourcesOk}/{snapshot.sources.length} источников
            </button>
          </div>
          {error && (
            <div className="op-error" role="alert">
              {error}{" "}
              {snapshot.generatedAt
                ? "Сохранён предыдущий снимок."
                : "Данные не подменяются учебными событиями."}
              <button
                className="op-button"
                onClick={() => void refresh()}
                disabled={busy}
              >
                Повторить
              </button>
            </div>
          )}
          {busy && !snapshot.generatedAt && (
            <div className="live-loading" role="status">
              <RefreshCw size={15} className="live-spin" />
              Загружаем сводку открытых источников…
            </div>
          )}
          {page === "overview" && (
            <>
              <div className="live-indicators">
                <button
                  onClick={() => {
                    setFreshness("recent");
                    go("events");
                  }}
                >
                  <TriangleAlert size={17} />
                  <span>
                    <small>Свежие за 72 ч</small>
                    <strong>
                      {recent.length}
                      <em>из {snapshot.events.length}</em>
                    </strong>
                  </span>
                </button>
                <button onClick={() => go("cameras")}>
                  <Camera size={17} />
                  <span>
                    <small>Камеры в каталоге</small>
                    <strong>
                      {verifiedCameraCatalog.length}
                      <em>
                        {playing
                          ? `${playing} проверено`
                          : "прямые потоки и кадры"}
                      </em>
                    </strong>
                  </span>
                </button>
                <button onClick={() => go("settings")}>
                  <Database size={17} />
                  <span>
                    <small>Источники онлайн</small>
                    <strong>
                      {sourcesOk}
                      <em>из {snapshot.sources.length} активны</em>
                    </strong>
                  </span>
                </button>
                <button onClick={() => go("map")}>
                  <MapPin size={17} />
                  <span>
                    <small>Точки на карте</small>
                    <strong>
                      {located.length}
                      <em>с координатами</em>
                    </strong>
                  </span>
                </button>
              </div>
              <div className="live-overview-grid">
                <section className="live-map-panel">
                  <div className="live-section-title">
                    <h2>Карта Алматы</h2>
                    <button onClick={() => go("map")}>
                      Развернуть <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {map}
                </section>
                <aside className="live-feed">
                  <div className="live-section-title">
                    <h2>Публикации источников</h2>
                    <button
                      onClick={() => {
                        setFreshness("all");
                        go("events");
                      }}
                    >
                      Все <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <p className="live-feed-note">
                    Официальные публикации и сигналы экстренных служб.
                  </p>
                  {snapshot.events.length ? (
                    snapshot.events
                      .slice(0, 5)
                      .map((e) => (
                        <EventCard
                          key={e.id}
                          event={e}
                          onSelect={() => setDetail(e)}
                        />
                      ))
                  ) : (
                    <div className="live-no-data">
                      <ShieldCheck size={23} />
                      <h3>
                        {busy
                          ? "Получаем сообщения"
                          : "Новых подтверждённых данных нет"}
                      </h3>
                      <p>
                        Проверяйте состояние источников. Пустой список не
                        означает отсутствие происшествий в городе.
                      </p>
                    </div>
                  )}
                  <div className="live-ai-brief">
                    <Sparkles size={19} />
                    <div>
                      <strong>QORGAU AI</strong>
                      <p>
                        {ai
                          ? "AI настроен. Запросите сводку по текущему снимку."
                          : "AI не подключён. Автоматическая сводка появится после добавления серверного ключа."}
                      </p>
                      <button onClick={() => go("ai")}>
                        {ai ? "Составить сводку" : "Открыть AI-раздел"}{" "}
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
              <SourceStrip snapshot={snapshot} onOpen={() => go("settings")} />
            </>
          )}
          {page === "map" && (
            <div className="live-full-map">
              {map}
              <p className="live-method">
                {located.length} публикаций с координатами ·{" "}
                {snapshot.events.length - located.length} без маркера.
                Расположение камер показано только при наличии подтверждённых
                координат.
              </p>
            </div>
          )}
          {["events", "analytics", "reports"].includes(page) && (
            <>
              <div className="live-filters">
                <label className="live-search">
                  <Search size={16} />
                  <input
                    aria-label="Поиск публикаций"
                    placeholder="Название, источник, город…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setEventPage(0);
                    }}
                  />
                </label>
                <select
                  aria-label="Категория событий"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setEventPage(0);
                  }}
                >
                  <option value="">Все категории</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  aria-label="Город публикаций"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setEventPage(0);
                  }}
                >
                  <option value="all">Все регионы источников</option>
                  <option value="Алматы">Алматы</option>
                </select>
                <select
                  aria-label="Свежесть публикаций"
                  value={freshness}
                  onChange={(e) => {
                    setFreshness(e.target.value);
                    setEventPage(0);
                  }}
                >
                  <option value="all">Весь полученный снимок</option>
                  <option value="recent">Свежие · 72 часа</option>
                  <option value="archive">Архив / дата неизвестна</option>
                </select>
                <button
                  className="op-button"
                  onClick={() => {
                    setQuery("");
                    setCategory("");
                    setScope("all");
                    setFreshness("all");
                    setEventPage(0);
                  }}
                >
                  Сбросить
                </button>
              </div>
              {page === "events" && (
                <>
                  <div className="live-list-heading">
                    <span>
                      {filtered.length} публикаций · без вывода о текущей
                      опасности
                    </span>
                    <button
                      className="op-button"
                      onClick={exportCsv}
                      disabled={!filtered.length}
                    >
                      <Download size={14} />
                      CSV
                    </button>
                  </div>
                  <div className="live-event-grid">
                    {filtered.slice(pageNo * 20, pageNo * 20 + 20).map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        onSelect={() => setDetail(e)}
                        expanded
                      />
                    ))}
                  </div>
                  {!filtered.length && (
                    <div className="live-no-data">
                      <Search size={26} />
                      <h3>Публикаций по выбранным условиям нет</h3>
                      <p>Измените фильтры или проверьте источники.</p>
                    </div>
                  )}
                  <div className="live-pagination">
                    <button
                      className="op-button"
                      disabled={pageNo === 0}
                      onClick={() => setEventPage(pageNo - 1)}
                    >
                      Назад
                    </button>
                    <span>
                      {pageNo + 1} /{" "}
                      {Math.max(1, Math.ceil(filtered.length / 20))}
                    </span>
                    <button
                      className="op-button"
                      disabled={(pageNo + 1) * 20 >= filtered.length}
                      onClick={() => setEventPage(pageNo + 1)}
                    >
                      Далее
                    </button>
                  </div>
                </>
              )}
              {page === "analytics" && (
                <LiveAnalytics
                  events={filtered}
                  snapshot={snapshot}
                  onSelect={setDetail}
                />
              )}
              {page === "reports" && (
                <section className="live-report">
                  <FileText size={34} />
                  <h2>Сводка публичных публикаций</h2>
                  <p>
                    Экспорт включает выбранные фильтры: {filtered.length}{" "}
                    публикаций, {filtered.filter(eventHasCoordinates).length} с
                    координатами. Время события, публикации и проверки сохранены
                    раздельно.
                  </p>
                  <div className="live-report-actions">
                    <button
                      className="op-primary"
                      onClick={exportCsv}
                      disabled={!filtered.length}
                    >
                      <Download size={15} />
                      Скачать CSV
                    </button>
                    <button
                      className="op-button"
                      onClick={() =>
                        downloadFile(
                          JSON.stringify(
                            {
                              generatedAt: snapshot.generatedAt,
                              filters: { query, category, scope, freshness },
                              events: filtered,
                              sources: snapshot.sources,
                            },
                            null,
                            2,
                          ),
                          "qorgau-public-snapshot.json",
                          "application/json",
                        )
                      }
                    >
                      <Download size={15} />
                      Снимок JSON
                    </button>
                    <button
                      className="op-button"
                      onClick={() => window.print()}
                    >
                      Печать / PDF
                    </button>
                  </div>
                  <div className="live-method">
                    Данные открытых источников не заменяют ведомственную
                    оперативную сводку. Экспорт не содержит учебных событий. В
                    JSON сохраняются также ошибки и время успешного обновления
                    источников.
                  </div>
                  <h3>Публикации в отчёте</h3>
                  {filtered.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      onSelect={() => setDetail(e)}
                    />
                  ))}
                </section>
              )}
            </>
          )}
          {page === "cameras" && (
            <CameraCenter
              cameras={verifiedCameraCatalog}
              canAdmin={false}
              saveCamera={async () => {
                throw new Error(
                  "Публичный каталог обновляется из проверенных источников",
                );
              }}
              checks={checks}
              onCheck={onCheck}
              initialCameraId={route.params.get("camera") ?? undefined}
              navigationToken={navigationRevision}
              onNavigateMap={openMap}
            />
          )}
          {page === "ai" && (
            <PublicAiPanel enabled={ai} onSources={() => go("settings")} />
          )}
          {page === "settings" && (
            <Sources
              snapshot={snapshot}
              busy={busy}
              refresh={() => void refresh()}
              ai={ai}
              onDemo={onDemo}
            />
          )}
          <footer className="live-footer">
            <span>
              QORGAU Vision · технологический прототип · общедоступные данные
            </span>
            <span>Обновление каждые 5 минут · часовой пояс Алматы (UTC+5)</span>
          </footer>
        </div>
      </main>
      {detail && (
        <div className="live-detail-backdrop" onClick={() => setDetail(null)}>
          <section
            className="live-event-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Публикация источника"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="live-detail-close"
              aria-label="Закрыть публикацию"
              onClick={() => setDetail(null)}
            >
              <X size={20} />
            </button>
            <span
              className={`live-state ${detail.status === "recent" ? "ok" : "muted"}`}
            >
              {detail.status === "recent"
                ? "Свежая публикация"
                : "Архив / дата неизвестна"}
            </span>
            <h2>{detail.title}</h2>
            <p className="live-detail-description">{detail.description}</p>
            <dl>
              <dt>Категория</dt>
              <dd>{detail.category}</dd>
              <dt>Место</dt>
              <dd>
                {[detail.city, detail.region].filter(Boolean).join(" · ") ||
                  "Не указано"}
              </dd>
              <dt>Время события</dt>
              <dd>
                {detail.occurredAt
                  ? displayTime(detail.occurredAt)
                  : "Источник не указал точное время"}
              </dd>
              <dt>Опубликовано</dt>
              <dd>
                {detail.publishedAt
                  ? displayTime(detail.publishedAt)
                  : "Не указано источником"}
              </dd>
              <dt>Проверено</dt>
              <dd>{displayTime(detail.checkedAt)}</dd>
              <dt>Координаты</dt>
              <dd>
                {eventHasCoordinates(detail)
                  ? `${detail.latitude}, ${detail.longitude}`
                  : "Не предоставлены; маркер не создан"}
              </dd>
              <dt>Проверка</dt>
              <dd>{detail.verification}</dd>
            </dl>
            <a
              className="op-primary"
              href={detail.url}
              target="_blank"
              rel="noreferrer"
            >
              {detail.sourceName}
              <ArrowUpRight size={15} />
            </a>
            {eventHasCoordinates(detail) && (
              <button
                className="op-button"
                onClick={() => {
                  go("map", {
                    latitude: String(detail.latitude),
                    longitude: String(detail.longitude),
                  });
                  setDetail(null);
                }}
              >
                <MapPin size={15} />
                Показать на карте
              </button>
            )}
            <p className="live-method">
              Публикация не подтверждает, что ситуация сохраняется сейчас.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function EventCard({
  event: e,
  onSelect,
  expanded = false,
}: {
  event: LiveEvent;
  onSelect: () => void;
  expanded?: boolean;
}) {
  const titlePrefix = e.title.replace(/…$/, "").trim();
  const extraDescription = e.description.startsWith(titlePrefix)
    ? e.description.slice(titlePrefix.length).trim()
    : e.description !== e.title
      ? e.description
      : "";
  return (
    <article className={`live-event-card ${expanded ? "expanded" : ""}`}>
      <button className="live-event-title" onClick={onSelect}>
        <span className="live-event-icon">
          <TriangleAlert size={16} />
        </span>
        <div>
          <small>
            {e.category} · {e.city || e.region || "Место не указано"}
          </small>
          <h3>{e.title}</h3>
        </div>
        <ChevronRight size={14} />
      </button>
      {expanded && extraDescription.length > 12 && (
        <p>
          {extraDescription.slice(0, 200)}
          {extraDescription.length > 200 ? "…" : ""}
        </p>
      )}
      <div className="live-event-meta">
        <Clock3 size={12} />
        <span>
          {liveEventDate(e)
            ? displayTime(liveEventDate(e)!)
            : "Дата не указана"}
        </span>
        <span className={e.status === "recent" ? "recent" : ""}>
          {e.status === "recent" ? "≤72 ч" : "Архив"}
        </span>
      </div>
      <div className="live-event-source">
        <a href={e.url} target="_blank" rel="noreferrer">
          {e.sourceName}
          <ArrowUpRight size={12} />
        </a>
        {eventHasCoordinates(e) && <small>На карте</small>}
      </div>
    </article>
  );
}
function SourceStrip({
  snapshot,
  onOpen,
}: {
  snapshot: LiveDataSnapshot;
  onOpen: () => void;
}) {
  return (
    <div className="live-source-strip">
      <button onClick={onOpen}>
        <Database size={14} />
        Обновления источников <ChevronRight size={13} />
      </button>
      {snapshot.sources.slice(0, 5).map((s) => (
        <button onClick={onOpen} key={s.id}>
          <i className={s.status} />
          <span>
            {s.name}
            <small>
              {s.lastSuccessAt
                ? displayTime(s.lastSuccessAt)
                : s.status === "external"
                  ? "Внешняя страница"
                  : "Нет успешного обновления"}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}
function Sources({
  snapshot,
  busy,
  refresh,
  ai,
  onDemo,
}: {
  snapshot: LiveDataSnapshot;
  busy: boolean;
  refresh: () => void;
  ai: boolean;
  onDemo: () => void;
}) {
  return (
    <>
      <div className="live-sources-intro">
        <div>
          <h2>Контроль происхождения данных</h2>
          <p>
            Сервер проверяет фиксированный список публичных адресов. Кеш — 5
            минут, автоматическое обновление открытой страницы — каждые 5 минут.
            Внешние страницы не считаются подключённым потоком данных.
          </p>
        </div>
        <button className="op-primary" onClick={refresh} disabled={busy}>
          <RefreshCw size={15} />
          {busy ? "Проверяем…" : "Обновить снимок"}
        </button>
      </div>
      <div className="live-sources-grid">
        {snapshot.sources.map((s) => (
          <article key={s.id} className="live-source-card">
            <header>
              <Database size={18} />
              <h3>{s.name}</h3>
              <span
                className={`live-state ${s.status === "ok" ? "ok" : s.status === "error" ? "warn" : "muted"}`}
              >
                {s.status === "ok"
                  ? "Данные получены"
                  : s.status === "error"
                    ? "Недоступен"
                    : "Внешняя страница"}
              </span>
            </header>
            <p>{s.note}</p>
            <dl>
              <dt>Проверка</dt>
              <dd>{displayTime(s.checkedAt)}</dd>
              <dt>Последний успех</dt>
              <dd>
                {s.lastSuccessAt ? displayTime(s.lastSuccessAt) : "Не получен"}
              </dd>
              <dt>Публикаций</dt>
              <dd>{s.eventCount}</dd>
            </dl>
            {s.error && <div className="live-source-error">{s.error}</div>}
            <a href={s.url} target="_blank" rel="noreferrer">
              Открыть источник <ArrowUpRight size={13} />
            </a>
          </article>
        ))}
      </div>
      <div className="live-settings-grid">
        <section>
          <h2>Реальные и учебные данные</h2>
          <p>
            Рабочий режим получает только публичные данные. Учебные
            происшествия, локальное редактирование и регистрация событий
            доступны отдельно.
          </p>
          <button className="op-button" onClick={onDemo}>
            <FlaskConical size={15} />
            Открыть DEMO
          </button>
        </section>
        <section>
          <h2>QORGAU AI</h2>
          <span className={`live-state ${ai ? "ok" : "warn"}`}>
            {ai ? "Ключ настроен" : "AI не подключён"}
          </span>
          <p>
            Серверная переменная: OPENAI_API_KEY. Необязательная: OPENAI_MODEL.
            После изменения переменных требуется новый деплой. AI_ENABLED=false
            отключает запросы.
          </p>
          <p className="live-method">
            Диалог отправляется только по кнопке. Ограничения: 3 запроса/мин и
            20/сутки на IP на экземпляр сервера; для общего лимита расходов
            используйте бюджет проекта OpenAI.
          </p>
        </section>
        <section>
          <h2>Границы прототипа</h2>
          <p>
            Закрытые полицейские камеры, ведомственные системы, идентификация
            людей и оперативные статусы не подключены. Публичные новости не
            являются полным реестром происшествий.
          </p>
          <p>
            Координаты не восстанавливаются автоматически из текста. Устаревшие
            и недоступные записи явно отмечены.
          </p>
        </section>
      </div>
    </>
  );
}
function LiveAnalytics({
  events,
  snapshot,
  onSelect,
}: {
  events: LiveEvent[];
  snapshot: LiveDataSnapshot;
  onSelect: (e: LiveEvent) => void;
}) {
  const categories = groupLive(events, "category"),
    sources = groupLive(events, "sourceName");
  return (
    <>
      <div className="live-analysis-summary">
        <div>
          <strong>{events.length}</strong>
          <span>публикаций в выборке</span>
        </div>
        <div>
          <strong>{events.filter((e) => e.status === "recent").length}</strong>
          <span>за последние 72 часа</span>
        </div>
        <div>
          <strong>{events.filter(eventHasCoordinates).length}</strong>
          <span>с известными координатами</span>
        </div>
      </div>
      <div className="live-analysis-grid">
        {[
          ["По категориям", categories],
          ["По источникам", sources],
        ].map(([title, rows]) => (
          <section className="live-analysis-panel" key={String(title)}>
            <h2>{String(title)}</h2>
            {(rows as [string, number][]).length ? (
              (rows as [string, number][]).map(([label, count]) => (
                <div className="live-bar-row" key={label}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                  <div>
                    <i
                      style={{
                        width: `${(100 * count) / Math.max(1, events.length)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p>Нет данных для расчёта.</p>
            )}
          </section>
        ))}
      </div>
      <p className="live-method">
        Количество публикаций не равно количеству происшествий: разные источники
        могут сообщать об одном событии. Период ограничен доступным снимком
        лент; полная статистика преступности и показатели безопасности не
        рассчитываются. Снимок:{" "}
        {snapshot.generatedAt
          ? displayTime(snapshot.generatedAt)
          : "ещё не получен"}
        .
      </p>
      <section className="live-analysis-panel">
        <h2>Основание расчётов</h2>
        {events.slice(0, 10).map((e) => (
          <EventCard key={e.id} event={e} onSelect={() => onSelect(e)} />
        ))}
        {events.length > 10 && (
          <p>Полная выборка доступна в разделах «Происшествия» и «Отчёты».</p>
        )}
      </section>
    </>
  );
}

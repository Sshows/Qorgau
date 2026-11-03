import {
  lazy,
  Suspense,
  useMemo,
  useState,
  useCallback,
  useEffect,
  Component,
} from "react";
import type { ReactNode } from "react";
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
  Plus,
  ArrowUpRight,
  LogIn,
  LogOut,
  Menu,
  Database,
  Radio,
  Search,
  MapPin,
  ArrowLeft,
  ChevronRight,
  Clock3,
  CheckCircle2,
  Activity,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { useOperations, api } from "./useOperations";
import {
  filterEvents,
  emptyFilters,
  displayTime,
  downloadFile,
  eventsCsv,
  roleNames,
} from "./operations";
import type { EventRecord, Filters, Role, CameraRecord } from "./operations";
import { EventForm, EventFilters, Modal, Select } from "./OperationForms";
import OperationsMap from "./OperationsMap";
import CameraCenter from "./CameraCenter";
import type { PlaybackChecks } from "./CameraCenter";
import Analytics, { Trend } from "./Analytics";
import AiPanel from "./AiPanel";
import { districts } from "./data";
import { additionalCameraLinks, twoGisTrafficUrl } from "./publicSources";
import {
  parseRoute,
  routeHash,
  loadSession,
  filterRouteValues,
} from "./navigation";
import type { Page } from "./navigation";
import "./operations.css";
import "./workspace.css";
const LegacyMap = lazy(() => import("./LegacyMap"));
const navigation = [
  ["overview", "Обзор", LayoutDashboard],
  ["map", "Карта", Map],
  ["events", "События", TriangleAlert],
  ["cameras", "Видеонаблюдение", Camera],
  ["analytics", "Аналитика", ChartNoAxesCombined],
  ["reports", "Отчёты", FileText],
  ["ai", "QORGAU AI", Sparkles],
  ["settings", "Настройки", Settings],
] as const;
const subtitles: Record<string, string> = {
  overview: "Ситуационная картина по данным QORGAU",
  map: "Объекты, события и публичные камеры на карте Алматы",
  events: "Регистрация, проверка и история обработки",
  cameras: "Публичные трансляции и каталог камер Алматы",
  analytics: "Закономерности в зарегистрированных данных",
  reports: "Настройте выборку и сохраните отчёт",
  ai: "Аналитический помощник с опорой на данные",
  settings: "Подключения, доступ и источники данных",
  lab: "Сохранённые инструменты предыдущей версии",
};
class Boundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="op-empty">
        <h2>Не удалось открыть раздел</h2>
        <button className="op-primary" onClick={() => location.reload()}>
          Обновить страницу
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <Boundary>
      <Workspace />
    </Boundary>
  );
}
function Workspace() {
  const store = useOperations();
  const [route, setRoute] = useState(() => parseRoute(location.hash)),
    [menu, setMenu] = useState(false),
    [login, setLogin] = useState(false),
    [toast, setToast] = useState(""),
    [search, setSearch] = useState(""),
    [eventPage, setEventPage] = useState(0),
    [lab, setLab] = useState(false),
    [checks, setChecks] = useState<PlaybackChecks>({}),
    [token, setToken] = useState(0),
    [filters, setFilters] = useState<Filters>(() =>
      loadSession("qorgau-event-filters", { ...emptyFilters }),
    ),
    [period, setPeriod] = useState("all");
  const page = route.page;
  const go = (p: Page, params: Record<string, string> = {}, entity = "") => {
    const hash = routeHash(p, params, entity);
    if (location.hash === hash) {
      setRoute(parseRoute(hash));
      setToken((t) => t + 1);
    } else location.hash = hash;
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    const change = () => {
      const next = parseRoute(location.hash);
      setRoute(next);
      setToken((t) => t + 1);
      setMenu(false);
      window.scrollTo(0, 0);
      if (next.page === "events" || next.page === "map") {
        const additions = filterRouteValues(next.params, { ...emptyFilters });
        if (Object.keys(additions).length)
          setFilters({ ...emptyFilters, ...additions });
      }
    };
    addEventListener("hashchange", change);
    change();
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("qorgau-event-filters", JSON.stringify(filters));
    } catch {}
  }, [filters]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  const onCheck = useCallback(
    (id: string, url: string, status: string) =>
      setChecks((c) => ({
        ...c,
        [id]: { status, url, checked_at: new Date().toISOString() },
      })),
    [],
  );
  const filtered = useMemo(
    () => filterEvents(store.events, filters),
    [store.events, filters],
  );
  const stats = useMemo(() => {
    const states = store.cameras.map((c) =>
      c.status === "Отключена"
        ? c.status
        : checks[c.id]?.url === c.stream_url
          ? checks[c.id].status
          : c.status,
    );
    return {
      available: states.filter((s) => s === "Доступна").length,
      unavailable: states.filter((s) => s === "Недоступна").length,
      unknown: states.filter((s) => s === "Не проверена").length,
    };
  }, [checks, store.cameras]);
  const detail = store.events.find((e) => e.id === route.entity);
  const composing =
    page === "events" &&
    (route.entity === "new" ||
      Boolean(detail && route.params.get("edit") === "1"));
  const title =
    navigation.find((n) => n[0] === page)?.[1] ??
    "Экспериментальные инструменты";
  const connected =
    store.mode === "demo" || Boolean(store.mode === "database" && store.user);
  const currentPage = Math.min(
    eventPage,
    Math.max(0, Math.ceil(filtered.length / 20) - 1),
  );
  const openEvent = (e: EventRecord) => go("events", {}, e.id);
  const explore = (f: Filters) => {
    setFilters(f);
    setEventPage(0);
    go("events", Object.fromEntries(Object.entries(f).filter(([, v]) => v)));
  };
  const openCamera = (c: CameraRecord) => go("cameras", { camera: c.id });
  const cameraMap = (c: CameraRecord) => {
    if (c.latitude !== null && c.longitude !== null)
      go("map", {
        latitude: String(c.latitude),
        longitude: String(c.longitude),
        camera: c.id,
      });
    else go("map", { district: c.district, camera: c.id });
  };
  const anchorDate = store.events.length
    ? Math.max(...store.events.map((e) => Date.parse(e.occurred_at)))
    : Date.now();
  const overviewEvents =
    period === "all"
      ? store.events
      : store.events.filter(
          (e) =>
            Date.parse(e.occurred_at) >=
            anchorDate - (Number(period) - 1) * 86400000,
        );
  const setEventsFilter = (key: keyof Filters, value: string) =>
    explore({ ...emptyFilters, [key]: value });
  return (
    <div className="op-workspace">
      {menu && (
        <button
          className="ws-backdrop"
          aria-label="Закрыть навигацию"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`op-sidebar ${menu ? "open" : ""}`}>
        <a className="op-brand" href="#overview">
          <span>
            <ShieldCheck size={28} />
          </span>
          <div>
            QORGAU <b>Vision</b>
            <small>ГОРОД В ПОЛЕ ЗРЕНИЯ</small>
          </div>
        </a>
        <div className="ws-nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Разделы QORGAU">
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "events" && <small>{store.events.length}</small>}
              {id === "ai" && <i className="ws-beta">AI</i>}
            </button>
          ))}
        </nav>
        <div className="ws-city-art" aria-hidden="true">
          <svg viewBox="0 0 200 95">
            <path d="M0 89 32 53 51 70 86 20 113 54 132 38 164 69 182 54 200 83" />
            <path d="m63 51 23-31 20 26-20-11-12 17M0 95l50-22 24 7 47-20 79 32" />
          </svg>
          <MapPin size={16} />
          <strong>Алматы</strong>
          <small>Казахстан · UTC+5</small>
        </div>
        <div className="op-sidebar-footer">
          <Database size={15} />
          <span>
            {store.mode === "database"
              ? "Серверная база"
              : store.mode === "demo"
                ? "Учебное пространство"
                : "Проверка сервера"}
            <small>QORGAU VISION / 02</small>
          </span>
        </div>
      </aside>
      <div className="op-body">
        <header className="op-topbar">
          <button
            className="op-mobile-toggle"
            aria-label="Открыть навигацию"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="ws-breadcrumb">
            <MapPin size={14} />
            <button onClick={() => go("overview")}>Ситуационный центр</button>
            <ChevronRight size={12} />
            <button onClick={() => go("map")}>Алматы</button>
          </div>
          <form
            className="ws-global-search"
            onSubmit={(e) => {
              e.preventDefault();
              explore({ ...emptyFilters, query: search });
            }}
          >
            <Search size={16} />
            <input
              aria-label="Глобальный поиск событий"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по событиям, районам…"
            />
            <button aria-label="Найти события" type="submit">
              <ChevronRight size={16} />
            </button>
          </form>
          <div className="op-topbar-actions">
            <button
              onClick={() => void store.refresh()}
              disabled={store.busy}
              aria-label="Обновить данные"
            >
              <RefreshCw size={16} className={store.busy ? "op-spin" : ""} />
            </button>
            <span className="ws-top-date">
              {displayTime(store.updated || new Date().toISOString())}
              <small>Время Алматы</small>
            </span>
            {store.user ? (
              <button
                onClick={() =>
                  void store.logout().catch((e) => setToast(e.message))
                }
                title="Выйти"
              >
                <span className="ws-avatar">
                  {store.user.display_name.slice(0, 1)}
                </span>
                <span>{roleNames[store.user.role]}</span>
                <LogOut size={14} />
              </button>
            ) : (
              <button onClick={() => setLogin(true)}>
                <span className="ws-avatar">
                  <LogIn size={14} />
                </span>
                <span>Войти</span>
              </button>
            )}
          </div>
        </header>
        <main className={`op-main ws-page-${page}`}>
          <div className="op-page-heading">
            <div className="ws-title-line">
              <span className="ws-title-icon">
                {page === "overview" ? (
                  <LayoutDashboard />
                ) : page === "cameras" ? (
                  <Camera />
                ) : page === "events" ? (
                  <TriangleAlert />
                ) : page === "map" ? (
                  <Map />
                ) : page === "analytics" ? (
                  <ChartNoAxesCombined />
                ) : page === "reports" ? (
                  <FileText />
                ) : page === "ai" ? (
                  <Sparkles />
                ) : (
                  <Settings />
                )}
              </span>
              <div>
                <h1>
                  {page === "overview" ? "Обзор города" : title}
                  <span
                    className={`op-tag ${store.mode === "demo" ? "green" : ""}`}
                  >
                    {store.mode === "demo"
                      ? "DEMO"
                      : store.mode === "database"
                        ? "БАЗА ДАННЫХ"
                        : "ПРОТОТИП"}
                  </span>
                </h1>
                <p>{subtitles[page]}</p>
              </div>
            </div>
            <div className="op-actions">
              {page !== "overview" && (
                <button
                  className="ws-back-button"
                  onClick={() => go("overview")}
                >
                  <ArrowLeft size={15} />К обзору
                </button>
              )}
              {connected && store.canWrite && page !== "lab" && !composing && (
                <button
                  className="op-primary"
                  onClick={() => go("events", {}, "new")}
                >
                  <Plus size={16} />
                  Создать событие
                </button>
              )}
            </div>
          </div>
          {store.mode === "demo" && (
            <div className="ws-data-banner">
              <span className="op-dot" />
              <strong>Учебные данные</strong>
              <span>
                События сохраняются в этом браузере. Камеры — публичные внешние
                источники.
              </span>
              <button onClick={() => go("settings")}>
                О подключениях <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {store.error && (
            <div className="op-error" role="alert">
              {store.error}
              <button onClick={() => void store.refresh()}>Повторить</button>
              {store.mode === "error" && (
                <button onClick={() => store.local()}>
                  Открыть локальное DEMO
                </button>
              )}
            </div>
          )}
          {store.mode === "loading" ? (
            <div className="ws-loading">
              <Activity className="op-spin" />
              <h2>Загружаем рабочее пространство</h2>
              <p>Проверка API и доступных данных…</p>
            </div>
          ) : !connected && page !== "settings" ? (
            <div className="op-empty">
              <ShieldCheck size={40} />
              <h2>Войдите в рабочее пространство</h2>
              <p>Доступ к серверным данным зависит от вашей роли.</p>
              <button className="op-primary" onClick={() => setLogin(true)}>
                Войти
              </button>
            </div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="ws-stat-grid">
                    <Stat
                      icon={<TriangleAlert />}
                      label="События в системе"
                      value={store.events.length}
                      note={`${store.events.filter((e) => e.is_demo).length} учебных записей`}
                      onClick={() => explore({ ...emptyFilters })}
                    />
                    <Stat
                      icon={<Camera />}
                      label="Камеры доступны"
                      value={`${stats.available} / ${store.cameras.length}`}
                      note={`${stats.unknown} ещё не проверено`}
                      onClick={() => go("cameras", { status: "Доступна" })}
                      tone="cyan"
                    />
                    <Stat
                      icon={<Clock3 />}
                      label="В работе"
                      value={
                        store.events.filter((e) => e.status === "В работе")
                          .length
                      }
                      note="Открыть события в обработке"
                      onClick={() => setEventsFilter("status", "В работе")}
                      tone="amber"
                    />
                    <Stat
                      icon={<Radio />}
                      label="Недоступные камеры"
                      value={stats.unavailable}
                      note="Результат проверки в этой сессии"
                      onClick={() => go("cameras", { status: "Недоступна" })}
                      tone="violet"
                    />
                  </div>
                  <div className="ws-overview-main">
                    <section className="ws-panel ws-map-panel">
                      <div className="ws-panel-heading">
                        <h2>
                          <MapPin size={17} />
                          Карта Алматы
                        </h2>
                        <button className="op-link" onClick={() => go("map")}>
                          Развернуть <ArrowUpRight size={14} />
                        </button>
                      </div>
                      <OperationsMap
                        workingMode="demo"
                        events={store.events}
                        cameras={store.cameras}
                        compact
                        onEventSelect={openEvent}
                        onCameraSelect={openCamera}
                      />
                    </section>
                    <section className="ws-panel ws-recent">
                      <div className="ws-panel-heading">
                        <h2>
                          <Activity size={16} />
                          Последние события
                        </h2>
                        <button
                          className="op-link"
                          onClick={() => explore({ ...emptyFilters })}
                        >
                          Все события <ArrowUpRight size={14} />
                        </button>
                      </div>
                      <EventList
                        events={filterEvents(store.events, emptyFilters).slice(
                          0,
                          4,
                        )}
                        onSelect={openEvent}
                      />
                      <div className="ws-recent-footer">
                        <span>
                          <span className="op-dot" />
                          Ручная регистрация
                        </span>
                        <small>Нет автоматической ленты</small>
                      </div>
                    </section>
                  </div>
                  <div className="ws-overview-bottom">
                    <section className="ws-panel ws-activity">
                      <div className="ws-panel-heading">
                        <h2>
                          <ChartNoAxesCombined size={16} />
                          Динамика регистрации
                        </h2>
                        <div className="op-segments">
                          {[
                            ["7", "7 дней"],
                            ["30", "30 дней"],
                            ["all", "Все данные"],
                          ].map(([id, label]) => (
                            <button
                              key={id}
                              className={period === id ? "active" : ""}
                              onClick={() => setPeriod(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Trend
                        events={overviewEvents}
                        onSelect={(day) =>
                          explore({ ...emptyFilters, from: day, to: day })
                        }
                      />
                      <small className="ws-chart-caption">
                        {period === "all"
                          ? "Все зарегистрированные даты"
                          : "Период заканчивается датой последней записи"}{" "}
                        · нажмите на точку для просмотра событий
                      </small>
                    </section>
                    <section className="ws-panel ws-ai-card">
                      <div className="ws-panel-heading">
                        <h2>
                          <Sparkles size={17} />
                          QORGAU AI
                        </h2>
                        <span className="op-tag">
                          {store.aiEnabled ? "Подключён" : "Следующий этап"}
                        </span>
                      </div>
                      <div className="ws-ai-body">
                        <div className="ws-ai-orb">
                          <Sparkles size={28} />
                        </div>
                        <div>
                          <h3>От событий — к пониманию</h3>
                          <p>
                            Сводки, сравнение районов и анализ данных.
                            Подключение модели выполняется отдельным этапом.
                          </p>
                        </div>
                      </div>
                      <div className="ws-ai-card-actions">
                        <button onClick={() => go("ai")}>
                          Открыть помощника <ArrowUpRight size={16} />
                        </button>
                        <button onClick={() => go("reports")}>
                          Создать отчёт <FileText size={15} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <section className="ws-panel ws-district-overview">
                    <div className="ws-panel-heading">
                      <h2>
                        <Map size={17} />
                        Районы Алматы
                      </h2>
                      <span className="op-muted">
                        Нажмите, чтобы открыть район на карте
                      </span>
                    </div>
                    <div className="ws-districts">
                      {districts.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => go("map", { district: d.name })}
                        >
                          <MapPin size={15} />
                          <span>{d.name}</span>
                          <strong>
                            {
                              store.events.filter((e) => e.district === d.name)
                                .length
                            }
                          </strong>
                          <ChevronRight size={14} />
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}
              {page === "map" && (
                <>
                  <div className="ws-map-filter">
                    <Select
                      label="Район карты"
                      value={filters.district}
                      options={districts.map((d) => d.name)}
                      all="Все районы"
                      onChange={(v) =>
                        setFilters((f) => ({ ...f, district: v }))
                      }
                    />
                    <Select
                      label="Категория событий"
                      value={filters.category}
                      options={[
                        ...new Set(store.events.map((e) => e.category)),
                      ]}
                      all="Все категории"
                      onChange={(v) =>
                        setFilters((f) => ({ ...f, category: v }))
                      }
                    />
                    <button
                      className="op-button"
                      onClick={() => setFilters({ ...emptyFilters })}
                    >
                      <RefreshCw size={14} />
                      Сбросить
                    </button>
                    <span className="op-muted">
                      {filtered.length} событий · {store.cameras.length} камер в
                      каталоге
                    </span>
                  </div>
                  <OperationsMap
                    workingMode="demo"
                    events={filtered}
                    cameras={store.cameras}
                    district={filters.district}
                    onDistrictChange={(v) =>
                      setFilters((f) => ({ ...f, district: v }))
                    }
                    onEventSelect={openEvent}
                    onCameraSelect={openCamera}
                    selectedCameraId={route.params.get("camera") ?? undefined}
                    focusPoint={
                      route.params.has("latitude")
                        ? {
                            latitude: Number(route.params.get("latitude")),
                            longitude: Number(route.params.get("longitude")),
                            nonce: token,
                          }
                        : undefined
                    }
                  />
                </>
              )}
              {page === "events" &&
                (composing ? (
                  <div className="ws-editor-layout">
                    <section className="ws-panel ws-event-editor">
                      <div className="ws-panel-heading">
                        <h2>
                          {detail
                            ? "Редактирование события"
                            : "Регистрация события"}
                        </h2>
                        <span className="op-tag">
                          {store.mode === "demo"
                            ? "DEMO"
                            : "Ручная регистрация"}
                        </span>
                      </div>
                      <EventForm
                        key={route.entity + route.params.get("edit")}
                        embedded
                        existing={detail}
                        demo={store.mode === "demo"}
                        onClose={() =>
                          detail ? openEvent(detail) : go("events")
                        }
                        onSave={async (input) => {
                          await store.saveEvent(input, detail);
                          if (!detail) setFilters({ ...emptyFilters });
                          setToast(
                            store.mode === "demo"
                              ? "Учебное событие сохранено в этом браузере."
                              : "Событие сохранено в базе.",
                          );
                        }}
                      />
                    </section>
                    <aside className="ws-panel ws-editor-guide">
                      <span className="ws-guide-number">01</span>
                      <h3>Зарегистрируйте наблюдение</h3>
                      <p>
                        Укажите понятное название, описание и время. Выберите
                        место на карте или введите координаты.
                      </p>
                      <span className="ws-guide-number">02</span>
                      <h3>Сохраните источник</h3>
                      <p>
                        Ручная запись не означает независимого подтверждения.
                        Учебные записи сохраняют отметку DEMO.
                      </p>
                      <span className="ws-guide-number">03</span>
                      <h3>Отслеживайте обработку</h3>
                      <p>
                        После сохранения событие появится в журнале, на карте и
                        в аналитике.
                      </p>
                    </aside>
                  </div>
                ) : detail ? (
                  <div className="ws-event-detail">
                    <div className="ws-detail-top">
                      <button className="op-link" onClick={() => go("events")}>
                        <ArrowLeft size={16} />К журналу событий
                      </button>
                      <span>
                        События <ChevronRight size={12} />
                        Карточка <span className="op-muted">{detail.id}</span>
                      </span>
                    </div>
                    <div className="ws-detail-grid">
                      <section className="ws-panel">
                        <div className="ws-event-title">
                          <EventIcon category={detail.category} />
                          <div>
                            <span className="op-tag">
                              {detail.is_demo ? "DEMO" : "Ручная регистрация"}
                            </span>
                            <h2>{detail.title}</h2>
                            <p>
                              {displayTime(detail.occurred_at)} ·{" "}
                              {detail.district}
                            </p>
                          </div>
                        </div>
                        <p className="ws-description">{detail.description}</p>
                        <dl className="op-details">
                          <dt>Категория</dt>
                          <dd>{detail.category}</dd>
                          <dt>Статус</dt>
                          <dd>
                            <span className="op-tag">{detail.status}</span>
                          </dd>
                          <dt>Приоритет</dt>
                          <dd>{detail.priority}</dd>
                          <dt>Источник</dt>
                          <dd>{detail.source}</dd>
                          <dt>Координаты</dt>
                          <dd>
                            {detail.latitude}, {detail.longitude}
                          </dd>
                          <dt>Обновлено</dt>
                          <dd>
                            {displayTime(detail.updated_at)} · версия{" "}
                            {detail.version}
                          </dd>
                        </dl>
                        <div className="op-actions">
                          {store.canWrite && (
                            <button
                              className="op-primary"
                              onClick={() =>
                                go("events", { edit: "1" }, detail.id)
                              }
                            >
                              <SlidersHorizontal size={16} />
                              Изменить событие
                            </button>
                          )}
                          <button
                            className="op-button"
                            onClick={() =>
                              go("map", {
                                latitude: String(detail.latitude),
                                longitude: String(detail.longitude),
                              })
                            }
                          >
                            <MapPin size={16} />
                            Показать на карте
                          </button>
                        </div>
                      </section>
                      <section className="ws-panel">
                        <div className="ws-panel-heading">
                          <h2>
                            <Clock3 size={17} />
                            История обработки
                          </h2>
                        </div>
                        {store.audit.filter((a) => a.entity_id === detail.id)
                          .length ? (
                          store.audit
                            .filter((a) => a.entity_id === detail.id)
                            .map((a) => (
                              <div className="ws-timeline" key={a.id}>
                                <span className="op-dot" />
                                <div>
                                  <strong>
                                    {a.action === "INSERT"
                                      ? "Событие создано"
                                      : "Событие изменено"}
                                  </strong>
                                  <small>
                                    {displayTime(a.created_at)} ·{" "}
                                    {a.actor ?? "Система"}
                                  </small>
                                  <details>
                                    <summary>Изменённые данные</summary>
                                    <pre>
                                      {JSON.stringify(
                                        {
                                          до: a.before_data,
                                          после: a.after_data,
                                        },
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </details>
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="op-empty">
                            <Clock3 size={28} />
                            <p>
                              Для встроенной учебной записи история не
                              создавалась. Изменения появятся здесь после
                              сохранения.
                            </p>
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ws-event-summary">
                      {[
                        ["Всего", store.events.length, ""],
                        [
                          "Новые",
                          store.events.filter((e) => e.status === "Новое")
                            .length,
                          "Новое",
                        ],
                        [
                          "В работе",
                          store.events.filter((e) => e.status === "В работе")
                            .length,
                          "В работе",
                        ],
                        [
                          "Закрыты",
                          store.events.filter((e) => e.status === "Закрыто")
                            .length,
                          "Закрыто",
                        ],
                      ].map(([label, value, status]) => (
                        <button
                          key={label}
                          className={filters.status === status ? "active" : ""}
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              status: String(status),
                            }))
                          }
                        >
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </button>
                      ))}
                    </div>
                    <section className="ws-panel ws-event-register">
                      <div className="ws-panel-heading">
                        <h2>
                          <SlidersHorizontal size={16} />
                          Фильтры событий
                        </h2>
                        <button
                          className="op-link"
                          onClick={() => setFilters({ ...emptyFilters })}
                        >
                          Сбросить фильтры
                        </button>
                      </div>
                      <EventFilters
                        filters={filters}
                        onChange={(f) => {
                          setFilters(f);
                          setEventPage(0);
                        }}
                      />
                      <div className="ws-panel-heading ws-table-heading">
                        <h2>
                          Журнал событий{" "}
                          <span className="op-tag">{filtered.length}</span>
                        </h2>
                        <button
                          className="op-button"
                          onClick={() =>
                            downloadFile(
                              "qorgau-events.csv",
                              eventsCsv(filtered),
                              "text/csv;charset=utf-8",
                            )
                          }
                        >
                          <Download size={14} />
                          Экспорт CSV
                        </button>
                      </div>
                      <div className="op-table-wrap">
                        <table className="op-table ws-event-table">
                          <thead>
                            <tr>
                              <th>Событие / источник</th>
                              <th>Район</th>
                              <th>Категория</th>
                              <th>Приоритет</th>
                              <th>Статус</th>
                              <th>Дата · Алматы</th>
                              <th aria-label="Действия" />
                            </tr>
                          </thead>
                          <tbody>
                            {filtered
                              .slice(currentPage * 20, currentPage * 20 + 20)
                              .map((e) => (
                                <tr key={e.id}>
                                  <td>
                                    <button
                                      className="ws-event-cell"
                                      onClick={() => openEvent(e)}
                                    >
                                      <EventIcon category={e.category} />
                                      <span>
                                        <strong>{e.title}</strong>
                                        <small>
                                          {e.is_demo
                                            ? "DEMO · учебное событие"
                                            : e.source}
                                        </small>
                                      </span>
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      className="op-link"
                                      onClick={() =>
                                        go("map", { district: e.district })
                                      }
                                    >
                                      {e.district}
                                    </button>
                                  </td>
                                  <td>{e.category}</td>
                                  <td>
                                    <span
                                      className={`op-priority ${e.priority === "Высокий" ? "high" : ""}`}
                                    >
                                      {e.priority}
                                    </span>
                                  </td>
                                  <td>
                                    <span
                                      className={`op-tag ${e.status === "Закрыто" ? "green" : ""}`}
                                    >
                                      {e.status}
                                    </span>
                                  </td>
                                  <td>{displayTime(e.occurred_at)}</td>
                                  <td>
                                    <button
                                      aria-label={`Открыть ${e.title}`}
                                      onClick={() => openEvent(e)}
                                    >
                                      <ArrowUpRight size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {!filtered.length && (
                        <div className="op-empty">
                          <Search size={28} />
                          <h3>События не найдены</h3>
                          <p>Измените условия поиска или сбросьте фильтры.</p>
                          <button
                            className="op-button"
                            onClick={() => setFilters({ ...emptyFilters })}
                          >
                            Сбросить фильтры
                          </button>
                        </div>
                      )}
                      <div className="op-pagination">
                        <span>
                          Показано {filtered.length ? currentPage * 20 + 1 : 0}–
                          {Math.min(filtered.length, (currentPage + 1) * 20)} из{" "}
                          {filtered.length}
                        </span>
                        {filtered.length > 20 && (
                          <>
                            <button
                              disabled={!currentPage}
                              onClick={() => setEventPage((p) => p - 1)}
                            >
                              ← Назад
                            </button>
                            <span>
                              {currentPage + 1} /{" "}
                              {Math.ceil(filtered.length / 20)}
                            </span>
                            <button
                              disabled={
                                (currentPage + 1) * 20 >= filtered.length
                              }
                              onClick={() => setEventPage((p) => p + 1)}
                            >
                              Далее →
                            </button>
                          </>
                        )}
                      </div>
                    </section>
                  </>
                ))}
              {page === "cameras" && (
                <CameraCenter
                  cameras={store.cameras}
                  canAdmin={store.canAdmin}
                  saveCamera={store.saveCamera}
                  checks={checks}
                  onCheck={onCheck}
                  initialStatus={route.params.get("status") ?? undefined}
                  initialDistrict={route.params.get("district") ?? undefined}
                  initialCameraId={route.params.get("camera") ?? undefined}
                  navigationToken={token}
                  onNavigateMap={cameraMap}
                />
              )}
              {(page === "analytics" || page === "reports") && (
                <Analytics
                  key={page}
                  events={store.events}
                  report={page === "reports"}
                  onExplore={explore}
                />
              )}
              {page === "ai" && (
                <AiPanel
                  enabled={store.aiEnabled}
                  connected={Boolean(store.user)}
                />
              )}
              {page === "settings" && (
                <>
                  <div className="ws-settings-top">
                    <div>
                      <ShieldCheck size={28} />
                      <h2>Рабочее пространство QORGAU</h2>
                      <p>Параметры хранения, доступа и внешних источников.</p>
                    </div>
                    <div className="ws-settings-version">
                      <span>ВЕРСИЯ ИНТЕРФЕЙСА</span>
                      <strong>02 / Situational</strong>
                      <small>React · Cesium · Vercel Functions</small>
                    </div>
                  </div>
                  <SystemPanel store={store} />
                  <section className="ws-panel ws-legacy-entry">
                    <div>
                      <h3>Экспериментальные инструменты</h3>
                      <p>
                        Сохранённые функции предыдущей версии: учебные маршруты,
                        патрули и публичные источники.
                      </p>
                    </div>
                    <button className="op-button" onClick={() => go("lab")}>
                      Открыть инструменты <ArrowUpRight size={15} />
                    </button>
                  </section>
                </>
              )}
              {page === "lab" && (
                <>
                  <div className="op-notice">
                    Учебная сцена предыдущей версии. Данные и патрули DEMO не
                    синхронизируются с журналом.
                  </div>
                  <button className="op-button" onClick={() => setLab(!lab)}>
                    {lab ? "Закрыть сцену" : "Открыть учебную сцену"}
                  </button>
                  {lab && (
                    <div className="op-legacy">
                      <Suspense fallback={<p>Загрузка…</p>}>
                        <LegacyMap />
                      </Suspense>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <footer className="op-footer">
            <span>
              <ShieldCheck size={12} />
              QORGAU Vision <b>Ситуационный центр</b>
            </span>
            <span>
              {store.mode === "demo"
                ? "Локальное DEMO"
                : "Серверное пространство"}{" "}
              · время Алматы / UTC+5
            </span>
          </footer>
        </main>
      </div>
      {login && (
        <Login
          configured={store.mode === "database"}
          onClose={() => setLogin(false)}
          onLogin={store.login}
        />
      )}
      {toast && (
        <div className="op-toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button onClick={() => setToast("")} aria-label="Закрыть уведомление">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  note,
  onClick,
  tone = "blue",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  note: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button className={`ws-stat ${tone}`} onClick={onClick}>
      <span className="ws-stat-icon">{icon}</span>
      <span className="ws-stat-body">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </span>
      <ArrowUpRight className="ws-stat-arrow" size={15} />
      <span className="ws-stat-decoration" aria-hidden="true" />
    </button>
  );
}
function EventIcon({ category }: { category: string }) {
  return (
    <span
      className={`ws-event-icon ${category === "ДТП" ? "red" : category === "Дорожная ситуация" ? "amber" : "blue"}`}
    >
      {category === "ДТП" ? (
        <TriangleAlert size={18} />
      ) : category === "Дорожная ситуация" ? (
        <SlidersHorizontal size={18} />
      ) : (
        <Activity size={18} />
      )}
    </span>
  );
}
function EventList({
  events,
  onSelect,
}: {
  events: EventRecord[];
  onSelect: (e: EventRecord) => void;
}) {
  return (
    <div className="op-event-list">
      {events.length ? (
        events.map((e) => (
          <button key={e.id} onClick={() => onSelect(e)}>
            <EventIcon category={e.category} />
            <span>
              <strong>{e.title}</strong>
              <small>{e.district}</small>
              <span className="ws-event-meta">
                <small>
                  <Clock3 size={10} />
                  {displayTime(e.occurred_at)}
                </small>
                <span className="op-tag">{e.is_demo ? "DEMO" : e.status}</span>
              </span>
            </span>
            <ChevronRight size={14} />
          </button>
        ))
      ) : (
        <div className="op-empty">События пока не зарегистрированы.</div>
      )}
    </div>
  );
}

function Login({
  configured,
  onClose,
  onLogin,
}: {
  configured: boolean;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Вход в QORGAU Vision" onClose={onClose}>
      {configured ? (
        <form
          className="op-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await onLogin(email, password);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Ошибка входа");
            } finally {
              setPassword("");
              setBusy(false);
            }
          }}
        >
          <p>
            Учётную запись создаёт администратор проекта. Публичная регистрация
            не предусмотрена.
          </p>
          <label className="op-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="op-field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="op-error">
              {error}
            </p>
          )}
          <button className="op-primary" disabled={busy}>
            {busy ? "Проверка…" : "Войти"}
          </button>
          <p className="op-muted">
            Сессия действует до одного часа. После истечения потребуется
            повторный вход.
          </p>
        </form>
      ) : (
        <p>
          Авторизация ещё не настроена. Администратору нужно подключить Supabase
          и выполнить миграцию базы. Пароли в DEMO-режиме не принимаются и не
          сохраняются.
        </p>
      )}
    </Modal>
  );
}
function SystemPanel({ store }: { store: ReturnType<typeof useOperations> }) {
  const [users, setUsers] = useState<
      { id: string; role: Role; display_name: string }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function loadUsers() {
    setBusy(true);
    try {
      setUsers(await api("users"));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="op-analytics-grid">
        <section className="op-panel">
          <h2>Подключения</h2>
          <dl className="op-details">
            <dt>Хранилище</dt>
            <dd>
              {store.mode === "database"
                ? "Серверный API настроен"
                : "Локальное DEMO"}
            </dd>
            <dt>Авторизация</dt>
            <dd>
              {store.user
                ? roleNames[store.user.role]
                : store.mode === "database"
                  ? "Требуется вход"
                  : "Не настроена"}
            </dd>
            <dt>QORGAU AI</dt>
            <dd>
              {store.aiEnabled ? "API включён, требуется вход" : "Не подключён"}
            </dd>
            <dt>Автоматические источники событий</dt>
            <dd>Не подключены</dd>
          </dl>
          <p>
            Сервер: Vercel Functions. Хранилище: PostgreSQL/PostGIS, вход:
            Supabase Auth. Для подключения нужны SUPABASE_URL и
            SUPABASE_ANON_KEY только в серверном окружении Vercel и миграция
            базы.
          </p>
          <p>
            AI: OPENAI_API_KEY, OPENAI_MODEL, AI_ENABLED=true. Расходы API
            согласуются отдельно. Ключи не вводятся в этом интерфейсе.
          </p>
        </section>
        <section className="op-panel">
          <h2>Достоверность данных</h2>
          <p>
            Ручная регистрация — сообщение пользователя, а не независимое
            подтверждение. DEMO — учебные данные. Каталог камер не гарантирует
            наличие эфира. Отметки OSM могут быть неполными и неофициальными.
          </p>
          <p>
            Координаты районов — ориентиры навигации. Точное расположение трёх
            камер Шымбулака не подтверждено. Система не определяет личности и не
            оценивает опасность людей.
          </p>
          <a
            className="op-link"
            href="/data/SOURCES.md"
            target="_blank"
            rel="noreferrer"
          >
            Источники и лицензии геоданных ↗
          </a>
          <a
            className="op-link"
            href="/data/PUBLIC-SOURCES.md"
            target="_blank"
            rel="noreferrer"
          >
            Проверка публичных источников ↗
          </a>
        </section>
      </div>
      <section className="op-panel">
        <h2>Внешние источники</h2>
        <div className="op-source-grid">
          <a
            href="https://shymbulak.com/live/"
            target="_blank"
            rel="noreferrer"
          >
            <strong>Шымбулак ↗</strong>
            <p>Владелец трёх существующих публичных трансляций.</p>
          </a>
          <a href={twoGisTrafficUrl()} target="_blank" rel="noreferrer">
            <strong>2ГИС · пробки Алматы ↗</strong>
            <p>Внешний сервис. Дорожные данные внутри QORGAU не загружаются.</p>
          </a>
          {additionalCameraLinks.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
              <strong>{s.name} ↗</strong>
              <p>{s.note} Каталог, не подключённый поток.</p>
            </a>
          ))}
        </div>
      </section>
      {store.user?.role === "admin" && (
        <section className="op-panel">
          <h2>Пользователи и роли</h2>
          <p>
            Новые аккаунты и восстановление доступа — через Supabase Auth. Ниже
            изменяются роли существующих пользователей.
          </p>
          <button
            className="op-button"
            disabled={busy}
            onClick={() => void loadUsers()}
          >
            Загрузить пользователей
          </button>
          {users.map((u) => (
            <div className="op-user-row" key={u.id}>
              <span>
                {u.display_name}
                <small>{u.id}</small>
              </span>
              <select
                aria-label={`Роль ${u.display_name}`}
                disabled={busy || u.id === store.user?.id}
                value={u.role}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await api("users", "PATCH", {
                      id: u.id,
                      role: e.target.value,
                    });
                    await loadUsers();
                    setMessage("Роль обновлена.");
                  } catch (e) {
                    setMessage(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {Object.entries(roleNames).map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {message && <p role="status">{message}</p>}
        </section>
      )}
      <section className="op-panel">
        <h2>Журнал действий</h2>
        <p>
          Последние 1000 действий доступного хранилища; серверный журнал
          записывает изменения данных и ролей. Входы дополнительно регистрирует
          Supabase Auth.
        </p>
        {store.audit.length ? (
          <div className="op-table-wrap">
            <table className="op-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Действие</th>
                  <th>Объект</th>
                  <th>Пользователь</th>
                </tr>
              </thead>
              <tbody>
                {store.audit.slice(0, 100).map((a) => (
                  <tr key={a.id}>
                    <td>{displayTime(a.created_at)}</td>
                    <td>{a.action}</td>
                    <td>
                      {a.entity_type} / {a.entity_id}
                    </td>
                    <td>{a.actor ?? "Система"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small>
              Показаны первые 100 записей. История конкретного события доступна
              в его карточке.
            </small>
          </div>
        ) : (
          <p className="op-muted">Действий пока нет или требуется вход.</p>
        )}
      </section>
    </>
  );
}

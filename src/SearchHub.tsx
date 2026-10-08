import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  MapPin,
  Newspaper,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  checkGithub,
  normalizeHandle,
  profileLinks,
  searchPlaces,
} from "./publicSearch";
import type { ProfileResult } from "./publicSearch";
import type { MapObject } from "./data";
import { twoGisTrafficUrl } from "./publicSources";

const PhonePanel = lazy(() => import("./PhonePanel"));
const tabs = [
  { id: "profiles", name: "Профили", icon: UserRound },
  { id: "phone", name: "Телефон", icon: Phone },
  { id: "places", name: "Организации", icon: Building2 },
  { id: "news", name: "Город и дороги", icon: Newspaper },
] as const;
const statusNames = {
  found: "Аккаунт найден",
  missing: "Не найден",
  unverified: "Не проверено",
  unavailable: "Нет подтверждения",
  incompatible: "Другой формат ника",
};
const citySources = [
  {
    name: "Almaty Joly",
    tag: "ДОРОГИ И ТРАНСПОРТ",
    url: "https://t.me/AlmatyJoly",
    description: "Официальные сообщения о перекрытиях и изменениях движения.",
  },
  {
    name: "Акимат Алматы",
    tag: "ГОРОДСКИЕ СООБЩЕНИЯ",
    url: "https://t.me/almaty_akimat",
    description:
      "Публичный Telegram-канал акимата: объявления и новости города.",
  },
  {
    name: "Новости на gov.kz",
    tag: "ПЕРВОИСТОЧНИК",
    url: "https://www.gov.kz/memleket/entities/almaty/press/news?lang=ru",
    description: "Публикации акимата на официальном государственном портале.",
  },
  {
    name: "2ГИС · пробки Алматы",
    tag: "ДОРОЖНАЯ ОБСТАНОВКА",
    url: twoGisTrafficUrl(),
    description: "Открыть дорожный слой в привычном интерфейсе 2ГИС.",
  },
];

function ProfilesPanel() {
  const [query, setQuery] = useState("");
  const [handle, setHandle] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lastRequest = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit() {
    let value: string;
    try {
      value = normalizeHandle(query);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    if (Date.now() - lastRequest.current < 2000) {
      setError("Подождите две секунды перед следующим запросом.");
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort(), 12000);
    lastRequest.current = Date.now();
    setBusy(true);
    setError("");
    setHandle(value);
    setResults(profileLinks(value));
    try {
      const github = await checkGithub(value, request.signal);
      if (controller.current === request && !request.signal.aborted)
        setResults((current) =>
          current.map((result) =>
            result.provider === "GitHub" ? github : result,
          ),
        );
    } catch {
      if (controller.current === request)
        setResults((current) =>
          current.map((result) =>
            result.provider === "GitHub"
              ? {
                  ...result,
                  status: "unavailable",
                  note: "Проверка недоступна: сеть, тайм-аут или лимит API. Откройте источник вручную.",
                }
              : result,
          ),
        );
    } finally {
      clearTimeout(timer);
      if (controller.current === request) setBusy(false);
    }
  }
  return (
    <div className="search-hub-panel">
      <h3>
        <UserRound size={18} /> Публичные профили по известному нику
      </h3>
      <p className="hub-note">
        Введите ник аккаунта, который уже знаете. Совпадающие ники на разных
        площадках могут принадлежать разным людям.
      </p>
      <form
        className="hub-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="public-handle" className="sr-only">
          Известный ник
        </label>
        <div>
          <span>@</span>
          <input
            id="public-handle"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError("");
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="Например: sherlock-project"
            maxLength={65}
          />
        </div>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? "Проверка…" : "Найти профили"}
          <Search size={16} />
        </button>
      </form>
      {error ? (
        <p className="hub-error" role="alert">
          {error}
        </p>
      ) : null}
      {results.length ? (
        <>
          <div className="hub-result-heading" role="status">
            <span>
              НИК: <strong>@{handle}</strong>
            </span>
            <span>
              {busy ? "Проверяем GitHub…" : "GitHub API · остальные вручную"}
            </span>
          </div>
          <div className="hub-profile-results">
            {results.map((result) => (
              <article key={result.provider}>
                <div>
                  <strong>{result.provider}</strong>
                  <span className={`hub-status ${result.status}`}>
                    {result.status === "found" ? <Check size={12} /> : null}
                    {statusNames[result.status]}
                  </span>
                </div>
                <p>{result.note}</p>
                {result.url ? (
                  <a href={result.url} target="_blank" rel="noreferrer">
                    Открыть источник <ArrowUpRight size={14} />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="hub-empty">
          <Search size={26} />
          <strong>Начните с одного известного ника</strong>
          <span>GitHub · GitLab · Codeberg · DEV Community · Telegram</span>
        </div>
      )}
      <div className="hub-privacy">
        <ShieldCheck size={16} />
        <span>
          Проверка подтверждает наличие аккаунта, а не личность владельца.
          История поиска и досье не сохраняются. Запрос ника отправляется GitHub
          только по кнопке.
        </span>
      </div>
      <p className="hub-source">
        Шаблоны пяти ссылок:{" "}
        <a
          href="https://github.com/sherlock-project/sherlock"
          target="_blank"
          rel="noreferrer"
        >
          Sherlock
        </a>{" "}
        ·{" "}
        <a href="/licenses/sherlock-MIT.txt" target="_blank" rel="noreferrer">
          MIT
        </a>
        . Остальные площадки открываются для ручной проверки. Полные CLI
        Sherlock, Maigret, GoSearch, OpenOSINT и Linkook не запускаются.
      </p>
    </div>
  );
}

function PlacesPanel({ onPlace }: { onPlace: (point: MapObject) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapObject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort(), 15000);
    setBusy(true);
    setError("");
    setResults([]);
    setSearched(false);
    try {
      const places = await searchPlaces(query, request.signal);
      if (!request.signal.aborted) {
        setResults(places);
        setSearched(true);
      }
    } catch (err) {
      if (controller.current === request)
        setError(
          request.signal.aborted
            ? "Источник не ответил вовремя. Попробуйте позже."
            : (err as Error).message,
        );
    } finally {
      clearTimeout(timer);
      if (controller.current === request) setBusy(false);
    }
  }
  return (
    <div className="search-hub-panel">
      <h3>
        <Building2 size={18} /> Организации и адреса Алматы
      </h3>
      <p className="hub-note">
        Публичные объекты OpenStreetMap в Алматы и окрестностях. Запрос
        отправляется Photon по нажатию кнопки.
      </p>
      <form
        className="hub-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="public-place" className="sr-only">
          Организация или адрес
        </label>
        <div>
          <MapPin size={16} />
          <input
            id="public-place"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например: Центральный стадион"
            autoComplete="off"
            maxLength={120}
          />
        </div>
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? "Поиск…" : "Найти на карте"}
          <Search size={16} />
        </button>
      </form>
      {error ? (
        <p className="hub-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="hub-place-results" aria-live="polite">
        {results.map((point) => (
          <article key={point.id}>
            <div>
              <strong>{point.name}</strong>
              <p>{point.address || "Адрес в источнике не указан"}</p>
              <a href={point.sourceUrl} target="_blank" rel="noreferrer">
                OpenStreetMap <ArrowUpRight size={13} />
              </a>
            </div>
            <button type="button" onClick={() => onPlace(point)}>
              <MapPin size={14} /> На карте
            </button>
          </article>
        ))}
        {searched && !results.length ? (
          <p className="hub-note">
            В этой области совпадений не найдено. Это не означает, что
            организации не существует.
          </p>
        ) : null}
      </div>
      {!searched && !busy && !error ? (
        <div className="hub-empty">
          <Building2 size={26} />
          <strong>Найдите публичный городской объект</strong>
          <span>Результат можно открыть на 3D-карте</span>
        </div>
      ) : null}
      <p className="hub-source">
        Источник:{" "}
        <a
          href="https://github.com/komoot/photon"
          target="_blank"
          rel="noreferrer"
        >
          Photon
        </a>{" "}
        /{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap, ODbL
        </a>
        . Общественный сервис может быть временно недоступен.{" "}
        <a href="https://2gis.kz/almaty" target="_blank" rel="noreferrer">
          Открыть 2ГИС
        </a>
        .
      </p>
    </div>
  );
}

export default function SearchHub({
  onClose,
  onPlace,
}: {
  onClose: () => void;
  onPlace: (point: MapObject) => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("profiles");
  const dialog = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    close.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dialog.current?.querySelector("[aria-expanded='true']")) return;
        onClose();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), [tabindex='0']",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="search-hub-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-hub-title"
        ref={dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          aria-label="Закрыть поиск"
          ref={close}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="eyebrow cyan">ОТКРЫТЫЕ ИСТОЧНИКИ</span>
        <h2 id="search-hub-title">Поиск и проверка</h2>
        <div className="hub-tabs" aria-label="Направление поиска">
          {tabs.map((item) => (
            <button
              key={item.id}
              aria-pressed={tab === item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={15} />
              {item.name}
            </button>
          ))}
        </div>
        {tab === "profiles" ? <ProfilesPanel /> : null}
        {tab === "phone" ? (
          <Suspense
            fallback={
              <div className="hub-empty">Загрузка проверки номера…</div>
            }
          >
            <PhonePanel />
          </Suspense>
        ) : null}
        {tab === "places" ? <PlacesPanel onPlace={onPlace} /> : null}
        {tab === "news" ? (
          <div className="search-hub-panel">
            <h3>
              <Newspaper size={18} /> Официальные сообщения города
            </h3>
            <p className="hub-note">
              Откройте первоисточник для свежих сообщений. Автоматическая лента
              и дорожные события внутри QORGAU пока не подключены.
            </p>
            <div className="hub-city-sources">
              {citySources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div>
                    <small>{source.tag}</small>
                    <strong>{source.name}</strong>
                    <p>{source.description}</p>
                  </div>
                  <ArrowUpRight size={18} />
                </a>
              ))}
            </div>
            <p className="hub-source">
              Официальные Telegram-каналы подтверждены{" "}
              <a
                href="https://www.gov.kz/memleket/entities/almaty/press/news/details/613173?lang=ru"
                target="_blank"
                rel="noreferrer"
              >
                публикацией акимата
              </a>
              . 2ГИС открывается в отдельной вкладке.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

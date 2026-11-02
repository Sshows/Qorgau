import { lazy, Suspense, useState } from "react";
import { Camera, MapPin, Settings2 } from "lucide-react";
import { districts } from "./data";
import { cameraTypes, cameraStatuses, displayTime } from "./operations";
import type { CameraRecord } from "./operations";
import { CameraForm, Modal, Select } from "./OperationForms";
import OperationsMap from "./OperationsMap";
const Player = lazy(() => import("./PublicCameraPlayer"));
export type PlaybackChecks = Record<
  string,
  { status: string; checked_at: string; url: string }
>;
export default function CameraCenter({
  cameras,
  canAdmin,
  saveCamera,
  checks,
  onCheck,
}: {
  cameras: CameraRecord[];
  canAdmin: boolean;
  saveCamera: (
    c: Omit<CameraRecord, "id" | "checked_at">,
    existing?: CameraRecord,
  ) => Promise<unknown>;
  checks: PlaybackChecks;
  onCheck: (id: string, url: string, status: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [district, setDistrict] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("name"),
    [view, setView] = useState("grid"),
    [page, setPage] = useState(0);
  const [active, setActive] = useState<CameraRecord | null>(null),
    [edit, setEdit] = useState<CameraRecord | "new" | null>(null),
    [wall, setWall] = useState<string[]>([]);
  function checked(c: CameraRecord) {
    return c.status === "Отключена"
      ? { status: c.status, checked_at: c.checked_at }
      : checks[c.id]?.url === c.stream_url
        ? checks[c.id]
        : c;
  }
  const filtered = cameras
    .filter(
      (c) =>
        (!query ||
          `${c.name} ${c.address}`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!district || c.district === district) &&
        (!type || c.type === type) &&
        (!status || checked(c).status === status),
    )
    .sort((a, b) =>
      String(
        sort === "status" ? checked(a).status : a[sort as "name" | "district"],
      ).localeCompare(
        String(
          sort === "status"
            ? checked(b).status
            : b[sort as "name" | "district"],
        ),
        "ru",
      ),
    );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 12) - 1),
  );
  function player(c: CameraRecord) {
    return c.status === "Отключена" ? (
      <p>Камера отключена администратором.</p>
    ) : (
      <Suspense fallback={<div className="op-skeleton">Загрузка плеера…</div>}>
        <Player
          source={{
            name: c.name,
            sourceUrl: c.source_url,
            streamUrl: c.stream_url,
          }}
          onPlayback={(s) => onCheck(c.id, c.stream_url, s)}
        />
      </Suspense>
    );
  }
  return (
    <>
      <div className="op-section-title">
        <div>
          <h2>
            Видеомониторинг <span>{cameras.length}</span>
          </h2>
          <p>Публичные источники · подключение по запросу</p>
        </div>
        {canAdmin && (
          <button className="op-primary" onClick={() => setEdit("new")}>
            + Добавить камеру
          </button>
        )}
      </div>
      <div className="op-filters">
        <label className="op-field op-search">
          <span>Поиск</span>
          <input
            value={query}
            placeholder="Название, адрес, объект"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <Select
          label="Район"
          value={district}
          onChange={(v) => {
            setDistrict(v);
            setPage(0);
          }}
          options={districts.map((d) => d.name)}
          all="Все районы"
        />
        <Select
          label="Тип камеры"
          value={type}
          onChange={setType}
          options={cameraTypes}
          all="Все типы"
        />
        <Select
          label="Доступность"
          value={status}
          onChange={setStatus}
          options={cameraStatuses}
          all="Все статусы"
        />
        <label className="op-field">
          <span>Сортировка</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">По названию</option>
            <option value="district">По району</option>
            <option value="status">По доступности</option>
          </select>
        </label>
      </div>
      <div className="op-toolbar">
        <div className="op-segments">
          {[
            ["grid", "Все камеры"],
            ["list", "Список"],
            ["wall", "Видеостена"],
            ["map", "На карте"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span>{filtered.length} найдено</span>
      </div>
      <p className="op-notice">
        Статусы и время проверки относятся к воспроизведению в этом браузере за
        текущую сессию. «Не проверена» не означает работающий эфир. Фонового
        мониторинга камер пока нет.
      </p>
      {view === "map" ? (
        <>
          <OperationsMap cameras={filtered} events={[]} district={district} />
          <p className="op-muted">
            Камеры без подтверждённых координат не изображаются отдельными
            точками. Для Шымбулака используется общий ориентир курорта.
          </p>
        </>
      ) : (
        <>
          <div className={`op-camera-grid ${view === "list" ? "list" : ""}`}>
            {filtered
              .slice(currentPage * 12, currentPage * 12 + 12)
              .map((c) => (
                <article className="op-camera-card" key={c.id}>
                  <button
                    className="op-camera-cover"
                    onClick={() => setActive(c)}
                  >
                    <Camera size={32} />
                    <span>Открыть трансляцию</span>
                  </button>
                  <div className="op-camera-info">
                    <div className="op-between">
                      <span
                        className={`op-tag ${checked(c).status === "Доступна" ? "green" : ""}`}
                      >
                        {checked(c).status}
                      </span>
                      {c.is_demo && <span className="op-tag">DEMO</span>}
                      {canAdmin && (
                        <button
                          onClick={() => setEdit(c)}
                          aria-label={`Настройки ${c.name}`}
                        >
                          <Settings2 size={16} />
                        </button>
                      )}
                    </div>
                    <button
                      className="op-camera-name"
                      onClick={() => setActive(c)}
                    >
                      {c.name}
                    </button>
                    <p>
                      <MapPin size={13} /> {c.address} · {c.district}
                    </p>
                    <small>
                      {c.type} · {displayTime(checked(c).checked_at)}
                    </small>
                    {view === "wall" && (
                      <label className="op-wall-toggle">
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
                        />{" "}
                        На видеостену
                      </label>
                    )}
                  </div>
                </article>
              ))}
          </div>
          {!filtered.length && (
            <div className="op-empty">Камер по выбранным фильтрам нет.</div>
          )}
          <div className="op-pagination">
            <button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ← Назад
            </button>
            <span>
              {currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / 12))}
            </span>
            <button
              disabled={(currentPage + 1) * 12 >= filtered.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Далее →
            </button>
          </div>
          {view === "wall" && (
            <>
              <p className="op-muted">
                Выберите до 4 камер. Каждый поток запускается отдельно; закрытие
                видеостены отключает видео.
              </p>
              <div className="op-wall">
                {cameras
                  .filter((c) => wall.includes(c.id) && filtered.includes(c))
                  .map((c) => (
                    <article className="op-panel" key={c.id}>
                      <h3>{c.name}</h3>
                      {player(c)}
                    </article>
                  ))}
              </div>
            </>
          )}
        </>
      )}
      {active && (
        <Modal title={active.name} onClose={() => setActive(null)} wide>
          {player(active)}
          <dl className="op-details">
            <dt>Район / адрес</dt>
            <dd>
              {active.district} · {active.address}
            </dd>
            <dt>Координаты</dt>
            <dd>
              {active.latitude === null
                ? "Не подтверждены"
                : `${active.latitude}, ${active.longitude}`}
            </dd>
            <dt>Примечание</dt>
            <dd>{active.location_note}</dd>
            <dt>Проверка воспроизведения</dt>
            <dd>
              {checked(active).status} ·{" "}
              {displayTime(checked(active).checked_at)}
            </dd>
          </dl>
        </Modal>
      )}
      {edit && (
        <CameraForm
          existing={edit === "new" ? undefined : edit}
          onSave={(value) =>
            saveCamera(value, edit === "new" ? undefined : edit)
          }
          onClose={() => setEdit(null)}
        />
      )}
    </>
  );
}

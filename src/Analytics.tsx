import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChartNoAxesCombined,
  CheckCheck,
  FileText,
  Filter,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import {
  almatyDate,
  counts,
  timeSeries,
  filterEvents,
  eventsCsv,
  downloadFile,
  displayTime,
  emptyFilters,
} from "./operations";
import type { EventRecord, Filters } from "./operations";
import { EventFilters } from "./OperationForms";
import {
  buildReportCsv,
  buildReportHtml,
  reportColumns,
  reportMetrics,
  reportValue,
} from "./reportExport";
import "./analytics.css";

export function Bars({
  values,
  label,
  onSelect,
}: {
  values: [string, number][];
  label: string;
  onSelect?: (name: string) => void;
}) {
  const total = values.reduce((sum, item) => sum + item[1], 0),
    max = Math.max(1, ...values.map((v) => v[1]));
  return (
    <div className="qga-bars" aria-label={label}>
      {values.length ? (
        values.map(([name, n], index) => {
          const content = (
            <>
              <span className="qga-bar-name">
                <i
                  style={{
                    background: [
                      "#28c9f0",
                      "#45e0bc",
                      "#efb34f",
                      "#8b9aff",
                      "#ed8295",
                    ][index % 5],
                  }}
                />
                {name}
              </span>
              <span className="qga-bar-number">
                {n}
                <small>{total ? Math.round((n / total) * 100) : 0}%</small>
              </span>
              <span className="qga-bar-track">
                <i
                  style={{
                    width: `${(n / max) * 100}%`,
                    background: [
                      "#28c9f0",
                      "#45e0bc",
                      "#efb34f",
                      "#8b9aff",
                      "#ed8295",
                    ][index % 5],
                  }}
                />
              </span>
              {onSelect && <ArrowUpRight size={13} className="qga-bar-arrow" />}
            </>
          );
          return onSelect ? (
            <button
              key={name}
              className="qga-bar-row"
              onClick={() => onSelect(name)}
              aria-label={`${name}: ${n}. Открыть события`}
            >
              {content}
            </button>
          ) : (
            <div key={name} className="qga-bar-row">
              {content}
            </div>
          );
        })
      ) : (
        <div className="qga-chart-empty">За выбранный период записей нет.</div>
      )}
    </div>
  );
}

export function Trend({
  events,
  weekly = false,
  onSelect,
}: {
  events: EventRecord[];
  weekly?: boolean;
  onSelect?: (day: string) => void;
}) {
  const id = useId().replace(/:/g, ""),
    allValues = timeSeries(events, weekly),
    values = allValues.slice(-90);
  const closed = new Map(
    timeSeries(
      events.filter((e) => e.status === "Закрыто"),
      weekly,
    ),
  );
  const max = Math.max(2, ...values.map((v) => v[1]));
  const [selectedDay, setSelectedDay] = useState("");
  const width = 720,
    height = 216,
    left = 34,
    top = 18,
    bottom = 182,
    plot = width - left - 18;
  const x = (i: number) =>
    values.length === 1
      ? left + plot / 2
      : left + (i * plot) / Math.max(1, values.length - 1);
  const y = (n: number) => bottom - (n / max) * (bottom - top);
  const line = (closedOnly: boolean) =>
    values
      .map(
        ([day, n], i) =>
          `${i ? "L" : "M"}${x(i)},${y(closedOnly ? (closed.get(day) ?? 0) : n)}`,
      )
      .join(" ");
  const selected = values.find(([day]) => day === selectedDay) ?? values.at(-1);
  return (
    <div className="qga-trend">
      <div className="qga-chart-legend">
        <span>
          <i />
          Все события
        </span>
        <span>
          <i className="amber" />
          Закрытые
        </span>
        {selected && (
          <strong>
            {selected[0].split("-").reverse().join(".")}{" "}
            <b>{selected[1]} событий</b>
          </strong>
        )}
      </div>
      {values.length ? (
        <>
          <svg
            className="qga-line-chart"
            viewBox={`0 0 ${width} ${height}`}
            role={onSelect ? "group" : "img"}
            aria-label={`Динамика событий ${weekly ? "по неделям" : "по дням"}. ${values.map((v) => v.join(": ")).join("; ")}`}
          >
            <defs>
              <linearGradient id={`area${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#25cbef" stopOpacity=".25" />
                <stop offset="100%" stopColor="#25cbef" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((n) => (
              <g key={n}>
                <line
                  x1={left}
                  x2={width - 18}
                  y1={top + ((bottom - top) * n) / 4}
                  y2={top + ((bottom - top) * n) / 4}
                  stroke="#263a4d"
                  strokeDasharray="3 5"
                />
                <text
                  x={left - 9}
                  y={top + ((bottom - top) * n) / 4 + 4}
                  textAnchor="end"
                >
                  {Math.round(max * (1 - n / 4) * 10) / 10}
                </text>
              </g>
            ))}
            <path
              d={`${line(false)} L${x(values.length - 1)},${bottom} L${x(0)},${bottom} Z`}
              fill={`url(#area${id})`}
            />
            <path
              d={line(true)}
              fill="none"
              stroke="#e7ad49"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d={line(false)}
              fill="none"
              stroke="#2ecdf0"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
            {values.map(([day, count], i) => (
              <g key={day}>
                {onSelect && (
                  <circle
                    cx={x(i)}
                    cy={y(count)}
                    r={13}
                    fill="transparent"
                    className="qga-chart-hit"
                    role="button"
                    tabIndex={0}
                    aria-label={`Точка графика ${day}: ${count} событий. Открыть события`}
                    onMouseEnter={() => setSelectedDay(day)}
                    onFocus={() => setSelectedDay(day)}
                    onClick={() => {
                      setSelectedDay(day);
                      onSelect(day);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDay(day);
                        onSelect(day);
                      }
                    }}
                  >
                    <title>
                      {day}: {count}
                    </title>
                  </circle>
                )}
                <circle
                  pointerEvents="none"
                  cx={x(i)}
                  cy={y(count)}
                  r={selectedDay === day ? 6 : 3.8}
                  fill="#2ecdf0"
                  stroke="#102132"
                  strokeWidth="2"
                />
                {(values.length < 10 ||
                  i % Math.ceil(values.length / 7) === 0 ||
                  i === values.length - 1) && (
                  <text x={x(i)} y={205} textAnchor="middle">
                    {day.slice(5).split("-").reverse().join(".")}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <div className="qga-point-controls" aria-label="Интервалы графика">
            {values.map(([day, count]) => (
              <button
                key={day}
                className={selectedDay === day ? "active" : ""}
                onMouseEnter={() => setSelectedDay(day)}
                onFocus={() => setSelectedDay(day)}
                onClick={() => {
                  setSelectedDay(day);
                  onSelect?.(day);
                }}
                aria-label={`Интервал ${day}: ${count} событий${onSelect ? ". Открыть события" : ". Показать значение"}`}
                title={`${day}: ${count}`}
              >
                <span>{day.slice(5).split("-").reverse().join(".")}</span>
                <b>{count}</b>
                {onSelect && <ArrowUpRight size={11} />}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="qga-chart-empty">
          Нет данных для графика. Измените период или создайте событие.
        </div>
      )}
      {allValues.length > 90 && (
        <small className="qga-chart-note">
          Показаны последние 90 интервалов; показатели выше включают всю
          выборку.
        </small>
      )}
    </div>
  );
}

const metricOptions = reportMetrics;
function storedFilters(key: string, initial?: Filters): Filters {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return {
      ...emptyFilters,
      ...Object.fromEntries(
        Object.keys(emptyFilters).map((name) => [
          name,
          typeof parsed?.[name] === "string" ? parsed[name] : "",
        ]),
      ),
      ...initial,
    };
  } catch {
    return { ...emptyFilters, ...initial };
  }
}
function dateAdd(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export default function Analytics({
  events,
  report = false,
  onExplore,
  initialFilters,
}: {
  events: EventRecord[];
  report?: boolean;
  onExplore?: (filters: Filters) => void;
  initialFilters?: Filters;
}) {
  const storageKey = report
    ? "qorgau-report-filters-v3"
    : "qorgau-analytics-filters-v3";
  const initialKey = JSON.stringify(initialFilters);
  const [filters, setFilters] = useState<Filters>(() =>
    storedFilters(storageKey, initialFilters),
  );
  const [fromB, setFromB] = useState(""),
    [toB, setToB] = useState(""),
    [compare, setCompare] = useState(false),
    [weekly, setWeekly] = useState(false);
  const [title, setTitle] = useState("Сводка зарегистрированных событий"),
    [metrics, setMetrics] = useState(metricOptions.map(([key]) => key)),
    [columns, setColumns] = useState(reportColumns.map(({ key }) => key));
  const [generated, setGenerated] = useState(() => new Date().toISOString()),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState(false);
  useEffect(() => {
    setFilters(storedFilters(storageKey, initialFilters));
  }, [storageKey, initialKey]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      /* Persistence is optional; filters remain usable in memory. */
    }
  }, [storageKey, filters]);
  const selected = useMemo(
    () => filterEvents(events, filters),
    [events, filters],
  );
  const comparison = filterEvents(events, { ...filters, from: fromB, to: toB });
  const demo = selected.filter((e) => e.is_demo).length,
    closed = selected.filter((e) => e.status === "Закрыто").length;
  const activeColumns = reportColumns.filter(({ key }) =>
    columns.includes(key),
  );
  const validRange = !filters.from || !filters.to || filters.from <= filters.to;
  const canExport = validRange && (!report || columns.length > 0);
  const open = (changes: Partial<Filters>) => {
    const next = { ...filters, ...changes };
    if (onExplore) onExplore(next);
    else setFilters(next);
  };
  const drillDay = (day: string) =>
    open({ from: day, to: weekly ? dateAdd(day, 6) : day });
  const period = `${filters.from || "Начало наблюдений"} — ${filters.to || "Все даты"}`;
  function range(days: number | null) {
    if (days === null) setFilters((f) => ({ ...f, from: "", to: "" }));
    else {
      const end = almatyDate(new Date());
      setFilters((f) => ({ ...f, from: dateAdd(end, 1 - days), to: end }));
    }
  }
  function exportCsv() {
    const content = report
      ? buildReportCsv(events, filters, columns)
      : eventsCsv(selected);
    downloadFile("qorgau-events.csv", content, "text/csv;charset=utf-8");
    setNotice(
      `CSV сформирован: ${selected.length} событий${report ? `, ${activeColumns.length + 1} столбцов` : ""}.`,
    );
  }
  function exportHtml() {
    const now = new Date().toISOString();
    setGenerated(now);
    downloadFile(
      "qorgau-report.html",
      buildReportHtml({
        events,
        filters,
        columns,
        metrics,
        title,
        generatedAt: now,
        weekly,
      }),
      "text/html;charset=utf-8",
    );
    setNotice(
      `Отчёт HTML сформирован: ${selected.length} событий. Файл открывается без подключения к сайту.`,
    );
  }
  const charts = (
    <div className="qga-chart-grid">
      {(!report || metrics.includes("trend")) && (
        <section className="qga-panel qga-dynamics">
          <div className="qga-panel-heading">
            <div>
              <span className="qga-kicker">РЕГИСТРАЦИЯ СОБЫТИЙ</span>
              <h3>Динамика по времени</h3>
            </div>
            <div className="qga-switch no-print">
              <button
                className={!weekly ? "active" : ""}
                onClick={() => setWeekly(false)}
              >
                По дням
              </button>
              <button
                className={weekly ? "active" : ""}
                onClick={() => setWeekly(true)}
              >
                По неделям
              </button>
            </div>
          </div>
          <Trend events={selected} weekly={weekly} onSelect={drillDay} />
          <p className="qga-footnote no-print">
            Выберите интервал под графиком, чтобы открыть события за этот
            период.
          </p>
        </section>
      )}
      {(!report || metrics.includes("categories")) && (
        <section className="qga-panel">
          <div className="qga-panel-heading">
            <div>
              <span className="qga-kicker">СТРУКТУРА ВЫБОРКИ</span>
              <h3>Категории событий</h3>
            </div>
            <ChartNoAxesCombined size={19} />
          </div>
          <Bars
            values={counts(selected, "category")}
            label="Категории событий"
            onSelect={(category) => open({ category })}
          />
        </section>
      )}
      {(!report || metrics.includes("districts")) && (
        <section className="qga-panel">
          <div className="qga-panel-heading">
            <div>
              <span className="qga-kicker">ГЕОГРАФИЯ</span>
              <h3>Распределение по районам</h3>
            </div>
            <span className="qga-mini-tag">
              {counts(selected, "district").length} районов
            </span>
          </div>
          <Bars
            values={counts(selected, "district")}
            label="Районы"
            onSelect={(district) => open({ district })}
          />
        </section>
      )}
      {(!report || metrics.includes("statuses")) && (
        <section className="qga-panel">
          <div className="qga-panel-heading">
            <div>
              <span className="qga-kicker">ОБРАБОТКА</span>
              <h3>Статусы событий</h3>
            </div>
            <CheckCheck size={19} />
          </div>
          <Bars
            values={counts(selected, "status")}
            label="Статусы"
            onSelect={(status) => open({ status })}
          />
        </section>
      )}
    </div>
  );
  return (
    <div
      className={`qga-workspace ${report ? "qga-reports" : "qga-analytics"}`}
    >
      <div className="qga-page-tools no-print">
        <div>
          <span className="qga-mini-tag">
            <Filter size={12} /> {selected.length} из {events.length} записей
          </span>
          <span className="qga-data-caption">По данным текущего хранилища</span>
        </div>
        <div className="qga-period-buttons">
          {[
            [7, "7 дней"],
            [30, "30 дней"],
            [90, "90 дней"],
            [null, "Все даты"],
          ].map(([days, label]) => (
            <button
              key={String(label)}
              onClick={() => range(days as number | null)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {report ? (
        <div className="qga-report-layout">
          <aside className="qga-report-config no-print">
            <div className="qga-config-heading">
              <SlidersHorizontal size={19} />
              <div>
                <h2>Конструктор отчёта</h2>
                <p>Настройте состав и выгрузите файл</p>
              </div>
            </div>
            <label className="op-field">
              <span>Название отчёта</span>
              <input
                value={title}
                maxLength={180}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="qga-config-section">
              <h3>
                01 <span>Выборка данных</span>
              </h3>
              <EventFilters filters={filters} onChange={setFilters} advanced />
              <button
                className="qga-reset"
                onClick={() => setFilters({ ...emptyFilters })}
              >
                <RotateCcw size={13} />
                Сбросить фильтры
              </button>
            </div>
            <div className="qga-config-section">
              <h3>
                02 <span>Разделы отчёта</span>
              </h3>
              <div className="qga-checks">
                {metricOptions.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={metrics.includes(key)}
                      onChange={() =>
                        setMetrics((m) =>
                          m.includes(key)
                            ? m.filter((x) => x !== key)
                            : [...m, key],
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="qga-config-section">
              <h3>
                03 <span>Столбцы таблицы / CSV</span>
              </h3>
              <div className="qga-checks">
                {reportColumns.map(({ key, label }) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={columns.includes(key)}
                      onChange={() =>
                        setColumns((c) =>
                          c.includes(key)
                            ? c.filter((x) => x !== key)
                            : [...c, key],
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="qga-footnote">
                Маркировка DEMO включается в каждый экспорт автоматически.
              </p>
            </div>
            <button
              className="op-primary qga-build-report"
              disabled={!canExport || !metrics.length}
              onClick={() => {
                setPreview(true);
                setGenerated(new Date().toISOString());
                setNotice(
                  "Предпросмотр обновлён. Скачайте HTML, CSV или сохраните PDF через печать.",
                );
              }}
            >
              <FileText size={16} />
              Сформировать отчёт
            </button>
          </aside>
          <section className="qga-preview-area">
            <div className="qga-export-toolbar no-print">
              <span>
                <i />
                {preview
                  ? "Отчёт сформирован"
                  : "Предпросмотр · обновляется по фильтрам"}
              </span>
              <div>
                <button disabled={!canExport} onClick={exportCsv}>
                  <ArrowDownToLine size={14} />
                  CSV
                </button>
                <button
                  disabled={!canExport || !metrics.length}
                  onClick={exportHtml}
                >
                  <ArrowDownToLine size={14} />
                  HTML-отчёт
                </button>
                <button
                  disabled={!canExport || !metrics.length}
                  onClick={() => {
                    setGenerated(new Date().toISOString());
                    setTimeout(() => window.print(), 50);
                  }}
                >
                  Печать / PDF
                </button>
              </div>
            </div>
            <article className="qga-report-paper op-report">
              <div className="qga-paper-header">
                <div className="qga-paper-brand">
                  QORGAU <span>VISION</span>
                </div>
                <span className="qga-paper-label">АНАЛИТИЧЕСКИЙ ОТЧЁТ</span>
              </div>
              <h2>{title || "Без названия"}</h2>
              <p className="qga-paper-period">
                {period} · {filters.district || "Все районы"}
              </p>
              <p className="qga-footnote">
                Сформировано: {displayTime(generated)} · время Алматы
              </p>
              <div className="qga-paper-stats">
                <div>
                  <strong>{selected.length}</strong>
                  <span>Событий в выборке</span>
                </div>
                <div>
                  <strong>{closed}</strong>
                  <span>Закрыто</span>
                </div>
                <div>
                  <strong>{demo}</strong>
                  <span>Учебных DEMO</span>
                </div>
              </div>
              <p className="qga-disclosure">
                {demo > 0 && <b>СОДЕРЖИТ DEMO · </b>}Статистика
                зарегистрированных записей QORGAU. Не отражает все происшествия
                города.
              </p>
              {charts}
              {metrics.includes("table") && (
                <div className="op-table-wrap qga-report-table">
                  <table className="op-table">
                    <thead>
                      <tr>
                        {activeColumns.map((c) => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                        <th>Происхождение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.map((e) => (
                        <tr key={e.id}>
                          {activeColumns.map((c) => (
                            <td key={c.key}>{reportValue(e, c.key)}</td>
                          ))}
                          <td>{e.is_demo ? "DEMO" : "Зарегистрировано"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!selected.length && (
                    <p className="qga-chart-empty">
                      Выборка пуста. Файл будет содержать заголовки и нулевые
                      показатели.
                    </p>
                  )}
                </div>
              )}
              <footer className="qga-paper-footer">
                Источник: текущее хранилище QORGAU · {selected.length} из{" "}
                {events.length} записей
              </footer>
            </article>
          </section>
        </div>
      ) : (
        <>
          <section className="qga-filter-panel no-print">
            <div className="qga-filter-heading">
              <span>
                <SlidersHorizontal size={15} />
                Параметры анализа
              </span>
              <button
                className="qga-reset"
                onClick={() => setFilters({ ...emptyFilters })}
              >
                <RotateCcw size={13} />
                Сбросить
              </button>
            </div>
            <EventFilters filters={filters} onChange={setFilters} advanced />
          </section>
          <div className="qga-kpis">
            <button onClick={() => open({})}>
              <span>Событий в выборке</span>
              <strong>{selected.length}</strong>
              <small>{period}</small>
              <ArrowUpRight size={17} />
            </button>
            <button onClick={() => open({ status: "В работе" })}>
              <span>В работе</span>
              <strong>
                {selected.filter((e) => e.status === "В работе").length}
              </strong>
              <small>Открыть соответствующие события</small>
              <ArrowUpRight size={17} />
            </button>
            <button onClick={() => open({ status: "Закрыто" })}>
              <span>Закрыто</span>
              <strong>{closed}</strong>
              <small>
                {selected.length
                  ? Math.round((closed / selected.length) * 100)
                  : 0}
                % текущей выборки
              </small>
              <ArrowUpRight size={17} />
            </button>
            <button onClick={() => open({ provenance: "demo" })}>
              <span>Учебных записей</span>
              <strong>{demo}</strong>
              <small>С маркировкой DEMO</small>
              <ArrowUpRight size={17} />
            </button>
          </div>
          {charts}
          <section className="qga-panel qga-comparison no-print">
            <div className="qga-panel-heading">
              <div>
                <span className="qga-kicker">КОНТЕКСТ</span>
                <h3>Сравнение двух периодов</h3>
              </div>
              <button
                className="qga-reset"
                onClick={() => setCompare(!compare)}
              >
                {compare ? "Свернуть" : "Настроить сравнение"}
              </button>
            </div>
            {compare ? (
              <>
                <div className="qga-compare-fields">
                  <label className="op-field">
                    <span>Начало второго периода</span>
                    <input
                      type="date"
                      value={fromB}
                      onChange={(e) => setFromB(e.target.value)}
                    />
                  </label>
                  <label className="op-field">
                    <span>Конец второго периода</span>
                    <input
                      type="date"
                      min={fromB}
                      value={toB}
                      onChange={(e) => setToB(e.target.value)}
                    />
                  </label>
                </div>
                {fromB && toB && fromB <= toB ? (
                  <div className="qga-compare-results">
                    <div>
                      <span>Текущая выборка</span>
                      <strong>{selected.length}</strong>
                    </div>
                    <div>
                      <span>Второй период</span>
                      <strong>{comparison.length}</strong>
                    </div>
                    <div>
                      <span>Разница</span>
                      <strong>
                        {selected.length - comparison.length > 0 ? "+" : ""}
                        {selected.length - comparison.length}
                      </strong>
                    </div>
                    <p>
                      Остальные фильтры применены одинаково. Периоды могут
                      отличаться по длительности.
                      {!comparison.length &&
                        " Процент не рассчитывается при нулевой базе."}
                    </p>
                    <button
                      onClick={() =>
                        onExplore
                          ? onExplore({ ...filters, from: fromB, to: toB })
                          : setFilters((f) => ({ ...f, from: fromB, to: toB }))
                      }
                    >
                      События второго периода <ArrowUpRight size={13} />
                    </button>
                  </div>
                ) : (
                  <p className="qga-footnote">
                    Укажите обе даты. Для текущей выборки период задаётся в
                    фильтрах выше.
                  </p>
                )}
              </>
            ) : (
              <p className="qga-footnote">
                Сопоставьте выбранные события с другим диапазоном дат.
              </p>
            )}
          </section>
          <div className="qga-bottom-actions no-print">
            <p>
              <span className="op-tag">
                {demo ? "СОДЕРЖИТ DEMO" : "ДАННЫЕ ХРАНИЛИЩА"}
              </span>{" "}
              Показатели рассчитаны по записям системы, не по полной городской
              статистике.
            </p>
            <div>
              <button
                className="op-button"
                disabled={!canExport}
                onClick={exportCsv}
              >
                <ArrowDownToLine size={15} />
                Экспорт CSV
              </button>
              <button className="op-primary" onClick={() => open({})}>
                Открыть события <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        </>
      )}
      {notice && (
        <div className="qga-export-notice no-print" role="status">
          {notice}
          <button
            aria-label="Закрыть сообщение экспорта"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

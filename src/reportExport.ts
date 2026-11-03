import {
  counts,
  csvCell,
  displayTime,
  filterEvents,
  timeSeries,
} from "./operations";
import type { EventRecord, Filters } from "./operations";

export const reportColumns: { key: keyof EventRecord; label: string }[] = [
  { key: "title", label: "Событие" },
  { key: "district", label: "Район" },
  { key: "category", label: "Категория" },
  { key: "occurred_at", label: "Дата · Алматы" },
  { key: "status", label: "Статус" },
  { key: "priority", label: "Приоритет" },
  { key: "source", label: "Источник" },
];
export const reportMetrics = [
  ["categories", "Категории"],
  ["districts", "Районы"],
  ["statuses", "Статусы"],
  ["trend", "Динамика"],
  ["table", "Таблица событий"],
];
export function reportValue(event: EventRecord, key: keyof EventRecord) {
  return key === "occurred_at"
    ? displayTime(event.occurred_at)
    : String(event[key]);
}
function chosenColumns(keys: (keyof EventRecord)[]) {
  const chosen = reportColumns.filter(({ key }) => keys.includes(key));
  if (!chosen.length) throw new Error("Выберите хотя бы один столбец отчёта.");
  return chosen;
}
function selectRows(events: EventRecord[], filters: Filters) {
  if (filters.from && filters.to && filters.from > filters.to)
    throw new Error("Начало периода позже окончания.");
  return filterEvents(events, filters);
}
export function buildReportCsv(
  events: EventRecord[],
  filters: Filters,
  columns: (keyof EventRecord)[],
) {
  const chosen = chosenColumns(columns),
    selected = selectRows(events, filters);
  return (
    "\ufeff" +
    [
      [...chosen.map((c) => c.label), "Происхождение"],
      ...selected.map((event) => [
        ...chosen.map((c) => reportValue(event, c.key)),
        event.is_demo ? "DEMO" : "Зарегистрировано",
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
export const escapeHtml = (text: unknown) =>
  String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export interface ReportHtmlOptions {
  events: EventRecord[];
  filters: Filters;
  columns: (keyof EventRecord)[];
  metrics: string[];
  title: string;
  generatedAt: string;
  weekly?: boolean;
}
export function buildReportHtml({
  events,
  filters,
  columns,
  metrics,
  title,
  generatedAt,
  weekly = false,
}: ReportHtmlOptions) {
  const chosen = chosenColumns(columns),
    selected = selectRows(events, filters);
  const demo = selected.filter((event) => event.is_demo).length;
  const closed = selected.filter((event) => event.status === "Закрыто").length;
  const period = `${filters.from || "Начало наблюдений"} — ${filters.to || "Все даты"}`;
  const sections = reportMetrics
    .filter(([key]) => metrics.includes(key) && key !== "table")
    .map(([key, label]) => {
      const rows =
        key === "trend"
          ? timeSeries(selected, weekly)
          : counts(
              selected,
              key === "categories"
                ? "category"
                : key === "districts"
                  ? "district"
                  : "status",
            );
      return `<h2>${label}</h2><table><tbody>${rows.map(([name, n]) => `<tr><td>${escapeHtml(name)}</td><td>${n}</td></tr>`).join("")}</tbody></table>`;
    })
    .join("");
  const table = metrics.includes("table")
    ? `<h2>События</h2><table><thead><tr>${chosen.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}<th>Происхождение</th></tr></thead><tbody>${selected.map((event) => `<tr>${chosen.map((c) => `<td>${escapeHtml(reportValue(event, c.key))}</td>`).join("")}<td>${event.is_demo ? "DEMO" : "Зарегистрировано"}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px system-ui,sans-serif;color:#162b3b;margin:42px;line-height:1.6}h1{font-size:28px}h2{margin-top:30px}table{border-collapse:collapse;width:100%;margin:14px 0}td,th{padding:9px;border:1px solid #c7d5df;text-align:left}th{background:#edf6f9}.meta{color:#526c7c}.tag{display:inline-block;background:#e8f6fc;padding:3px 9px;border-radius:4px}@media print{body{margin:14mm}tr{break-inside:avoid}}</style><body><p class="meta">QORGAU VISION / ОТЧЁТ</p><h1>${escapeHtml(title)}</h1><p class="meta">${escapeHtml(period)} · ${escapeHtml(filters.district || "Все районы")} · ${escapeHtml(filters.category || "Все категории")} · ${escapeHtml(filters.status || "Все статусы")} · Приоритет: ${escapeHtml(filters.priority || "все")} · Происхождение: ${escapeHtml(filters.provenance || "все записи")} · Поиск: ${escapeHtml(filters.query || "не задан")}</p><p class="meta">Сформировано ${escapeHtml(displayTime(generatedAt))} · время Алматы (UTC+5)</p><p><span class="tag">${demo ? `Содержит DEMO: ${demo}` : "Зарегистрированные данные"}</span></p><p>Всего ${selected.length} событий, закрыто ${closed}. Это статистика записей QORGAU, а не всех происшествий города.</p>${sections}${table}<p class="meta">Источник: текущее хранилище QORGAU. Отобрано ${selected.length} из ${events.length} записей. Демонстрационные записи имеют явную маркировку.</p></body></html>`;
}

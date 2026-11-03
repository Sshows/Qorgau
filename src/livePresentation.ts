import type { LiveEvent } from "./liveData";
export function filterLiveEvents(
  events: LiveEvent[],
  query = "",
  category = "",
  scope = "all",
  freshness = "all",
) {
  const text = query.trim().toLocaleLowerCase("ru");
  return events.filter(
    (e) =>
      (!category || e.category === category) &&
      (scope === "all" ||
        e.city
          .toLocaleLowerCase("ru")
          .includes(scope.toLocaleLowerCase("ru"))) &&
      (!freshness || freshness === "all" || e.status === freshness) &&
      (!text ||
        [e.title, e.description, e.city, e.region, e.sourceName]
          .join(" ")
          .toLocaleLowerCase("ru")
          .includes(text)),
  );
}
function cell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function liveCsv(events: LiveEvent[]) {
  return (
    "\uFEFF" +
    [
      [
        "ID",
        "Название",
        "Описание",
        "Категория",
        "Город",
        "Регион",
        "Время события",
        "Опубликовано",
        "Проверено",
        "Широта",
        "Долгота",
        "Источник",
        "Оригинал",
        "Проверка",
        "Свежесть",
      ],
      ...events.map((e) => [
        e.id,
        e.title,
        e.description,
        e.category,
        e.city,
        e.region,
        e.occurredAt,
        e.publishedAt,
        e.checkedAt,
        e.latitude,
        e.longitude,
        e.sourceName,
        e.url,
        e.verification,
        e.status,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
export function groupLive(
  events: LiveEvent[],
  field: "category" | "sourceName",
) {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e[field], (counts.get(e[field]) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

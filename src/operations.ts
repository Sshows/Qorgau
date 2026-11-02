import { districts, incidents } from './data';
import type { MapObject } from './data';
import { publicCameraSources } from './publicSources';

export const categories = ['ДТП', 'Дорожная ситуация', 'Авария инфраструктуры', 'Пожар', 'Чрезвычайная ситуация', 'Общественный порядок', 'Другое'] as const;
export const statuses = ['Новое', 'Проверяется', 'Подтверждено', 'В работе', 'Закрыто'] as const;
export const priorities = ['Низкий', 'Средний', 'Высокий'] as const;
export const cameraTypes = ['Дорожная', 'Городская', 'Общественное пространство', 'Транспортный узел', 'Туристическая'] as const;
export const cameraStatuses = ['Не проверена', 'Доступна', 'Недоступна', 'Отключена'] as const;
export type Role = 'admin' | 'operator' | 'observer';
export const roleNames: Record<Role, string> = { admin: 'Администратор', operator: 'Оператор', observer: 'Наблюдатель' };
export interface EventRecord {
  id: string; title: string; description: string; category: string; district: string;
  latitude: number; longitude: number; occurred_at: string; priority: string; status: string;
  is_demo: boolean; source: string; created_at: string; updated_at: string; version: number;
}
export type EventInput = Omit<EventRecord, 'id' | 'created_at' | 'updated_at' | 'version'>;
export interface CameraRecord {
  id: string; name: string; district: string; address: string; type: string; stream_url: string;
  source_url: string; latitude: number | null; longitude: number | null; location_note: string;
  status: string; checked_at: string | null; is_demo: boolean;
}
export interface AuditRecord { id: string; entity_id: string; entity_type: string; action: string; actor: string | null; created_at: string; before_data: unknown; after_data: unknown }
export interface Filters { query: string; district: string; category: string; status: string; priority: string; from: string; to: string; provenance: string }
export const emptyFilters: Filters = { query: '', district: '', category: '', status: '', priority: '', from: '', to: '', provenance: '' };
export const demoEvents: EventRecord[] = incidents.map((item, index) => ({
  id: `demo-${index + 1}`, title: item.name, description: item.description,
  category: ['ДТП','Авария инфраструктуры','Дорожная ситуация','Авария инфраструктуры','Общественный порядок'][index] ?? 'Другое', district: item.district,
  latitude: item.latitude, longitude: item.longitude, occurred_at: `2026-10-${String(26 + index).padStart(2, '0')}T09:30:00.000Z`,
  priority: item.severity === 'high' ? 'Высокий' : 'Средний', status: index === 4 ? 'Закрыто' : 'Новое',
  is_demo: true, source: 'Встроенный учебный сценарий', created_at: '2026-10-26T09:30:00.000Z', updated_at: '2026-10-26T09:30:00.000Z', version: 1,
}));
export const seedCameras: CameraRecord[] = publicCameraSources.map(source => ({
  id: source.id, name: source.name, district: 'Медеуский', address: 'Горный курорт Шымбулак', type: 'Туристическая',
  stream_url: source.streamUrl, source_url: source.sourceUrl, latitude: null, longitude: null,
  location_note: 'Точное место установки не подтверждено. На карте показан общий ориентир курорта.',
  status: 'Не проверена', checked_at: null, is_demo: false,
}));
export function almatyDate(value: string | Date): string {
  return new Date(new Date(value).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}
export function displayTime(value: string | null) {
  return value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' }) : 'Ещё не проверена';
}
export function filterEvents(events: EventRecord[], f: Filters): EventRecord[] {
  return events.filter(e => (!f.query || `${e.title} ${e.description} ${e.id}`.toLowerCase().includes(f.query.toLowerCase())) &&
    (!f.district || e.district === f.district) && (!f.category || e.category === f.category) && (!f.status || e.status === f.status) &&
    (!f.priority || e.priority === f.priority) && (!f.from || almatyDate(e.occurred_at) >= f.from) && (!f.to || almatyDate(e.occurred_at) <= f.to) &&
    (!f.provenance || (f.provenance === 'demo') === e.is_demo)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}
function text(value: unknown, name: string, max: number, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`${name}: от ${min} до ${max} символов.`);
  return value.trim();
}
function option(value: unknown, options: readonly string[], name: string) {
  if (typeof value !== 'string' || !options.includes(value)) throw new Error(`Некорректное поле: ${name}.`);
  return value;
}
export function validateEvent(raw: unknown): EventInput {
  if (!raw || typeof raw !== 'object') throw new Error('Ожидается событие.');
  const e = raw as Record<string, unknown>;
  if (typeof e.latitude !== 'number' || typeof e.longitude !== 'number' || !Number.isFinite(e.latitude) || !Number.isFinite(e.longitude) || e.latitude < 42.8 || e.latitude > 43.6 || e.longitude < 76.5 || e.longitude > 77.3) throw new Error('Выберите координаты в регионе Алматы.');
  if (typeof e.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(e.occurred_at) || !Number.isFinite(Date.parse(e.occurred_at))) throw new Error('Укажите дату и время события.');
  if (typeof e.is_demo !== 'boolean') throw new Error('Укажите происхождение данных.');
  return {
    title: text(e.title, 'Название', 180, 3), description: text(e.description, 'Описание', 4000, 3),
    category: option(e.category, categories, 'категория'), district: option(e.district, districts.map(d => d.name), 'район'),
    priority: option(e.priority, priorities, 'приоритет'), status: option(e.status, statuses, 'статус'),
    latitude: e.latitude, longitude: e.longitude, occurred_at: new Date(e.occurred_at).toISOString(), is_demo: e.is_demo, source: text(e.source, 'Источник', 500, 3),
  };
}
export function publicHttps(value: unknown): string {
  const url = new URL(text(value, 'URL', 2048));
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || !url.hostname.includes('.')) throw new Error('Нужен публичный HTTPS-адрес без учётных данных.');
  return url.href;
}
export function validateCamera(raw: unknown): Omit<CameraRecord, 'id' | 'checked_at'> {
  if (!raw || typeof raw !== 'object') throw new Error('Ожидается камера.');
  const c = raw as Record<string, unknown>;
  const latitude = c.latitude === null ? null : Number(c.latitude);
  const longitude = c.longitude === null ? null : Number(c.longitude);
  if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < 42.8 || latitude > 43.6 || longitude === null || !Number.isFinite(longitude) || longitude < 76.5 || longitude > 77.3))) throw new Error('Укажите обе координаты или оставьте обе пустыми.');
  const stream_url = publicHttps(c.stream_url);
  if (!new URL(stream_url).pathname.endsWith('.m3u8')) throw new Error('Нужен прямой HLS-поток .m3u8, а не страница каталога.');
  return { name: text(c.name, 'Название', 180, 3), district: option(c.district, districts.map(d => d.name), 'район'), address: text(c.address, 'Адрес', 300, 3), type: option(c.type, cameraTypes, 'тип камеры'), stream_url, source_url: publicHttps(c.source_url), latitude, longitude, location_note: text(c.location_note, 'Точность координат', 500, 3), status: option(c.status, ['Не проверена', 'Отключена'], 'статус'), is_demo: c.is_demo === true };
}
export function toMapEvent(e: EventRecord): MapObject {
  return { id: e.id, name: e.title, kind: 'incident', latitude: e.latitude, longitude: e.longitude, district: e.district, description: e.description, isDemo: e.is_demo, status: e.status, severity: e.priority === 'Высокий' ? 'high' : e.priority === 'Средний' ? 'medium' : 'low' };
}
export function counts(events: EventRecord[], key: 'category' | 'district' | 'status' | 'priority') {
  return Object.entries(events.reduce<Record<string, number>>((acc, e) => { acc[e[key]] = (acc[e[key]] ?? 0) + 1; return acc; }, {})).sort((a,b) => b[1]-a[1]);
}
export function timeSeries(events: EventRecord[], weekly = false) {
  const values: Record<string, number> = {};
  for (const event of events) {
    const date = new Date(`${almatyDate(event.occurred_at)}T00:00:00Z`);
    if (weekly) date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const key = date.toISOString().slice(0, 10); values[key] = (values[key] ?? 0) + 1;
  }
  const keys = Object.keys(values).sort();
  if (!keys.length) return [];
  const cursor = new Date(`${keys[0]}T00:00:00Z`), end = keys[keys.length - 1];
  const result: [string, number][] = [];
  while (cursor.toISOString().slice(0, 10) <= end && result.length < 3660) { const day = cursor.toISOString().slice(0,10); result.push([day, values[day] ?? 0]); cursor.setUTCDate(cursor.getUTCDate() + (weekly ? 7 : 1)); }
  return result;
}
export function csvCell(value: unknown) {
  let str = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replaceAll('"', '""')}"`;
}
export function eventsCsv(events: EventRecord[]) {
  return '\ufeff' + [['ID','Название','Категория','Район','Статус','Приоритет','Время UTC','DEMO','Источник','Широта','Долгота'], ...events.map(e => [e.id,e.title,e.category,e.district,e.status,e.priority,e.occurred_at,e.is_demo?'DEMO':'Зарегистрировано',e.source,e.latitude,e.longitude])].map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], {type})); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

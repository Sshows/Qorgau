import type { MapObject } from './data';

export type RouteResult = { points: number[][]; label: string; distanceKm: number; durationMin: number; isFallback: boolean };
let lastRouteAt = 0;
const routeCache = new Map<string, RouteResult>();

export async function getRoute(from: MapObject, to: MapObject, signal: AbortSignal): Promise<RouteResult> {
  const key = `${from.id}:${to.id}:${to.longitude}:${to.latitude}`;
  if (routeCache.has(key)) return routeCache.get(key)!;
  if (Date.now() - lastRouteAt < 1100) throw new Error('Подождите секунду перед следующим маршрутом.');
  lastRouteAt = Date.now();
  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson`;
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw new Error('Сервис маршрутов временно недоступен.');
  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route?.geometry?.coordinates?.length) throw new Error('Не удалось найти автомобильный маршрут.');
  const result = { points: route.geometry.coordinates, distanceKm: route.distance / 1000, durationMin: Math.max(1, Math.round(route.duration / 60)), label: `${from.name} → ${to.name}`, isFallback: false };
  routeCache.set(key, result);
  return result;
}

export async function loadPolice(signal: AbortSignal): Promise<MapObject[]> {
  const response = await fetch('/data/almaty-police.geojson', { signal });
  if (!response.ok) throw new Error('Набор объектов OpenStreetMap пока недоступен.');
  const data = await response.json();
  return data.features.filter((feature: { geometry: { type: string } }) => feature.geometry?.type === 'Point').map((feature: { properties: Record<string,string>; geometry: { coordinates: number[] } }, index: number): MapObject => ({
    id: `osm-police-${feature.properties.osmId ?? index}`,
    name: feature.properties.name || 'Объект полиции · OSM', kind: 'police',
    longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1],
    district: 'Открытые данные', description: 'Общедоступная отметка OpenStreetMap. Данные могут быть неполными; статус работы не проверен.',
    isDemo: false, address: feature.properties.address, status: 'OpenStreetMap',
    sourceUrl: `https://www.openstreetmap.org/${feature.properties.osmType || 'node'}/${feature.properties.osmId}`,
  }));
}

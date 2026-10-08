import type { MapObject } from "./data";

export interface PublicCameraSource {
  id: string;
  name: string;
  streamUrl: string;
  sourceUrl: string;
}

// Publicly advertised by the resort at /live/. Browser playback only: no proxy,
// recording, credentials or extracted private surveillance endpoints.
export const publicCameraSources: PublicCameraSource[] = [
  {
    id: "shymbulak-base",
    name: "Базовая станция",
    streamUrl: "https://ipcam.kz:443/cam1/index.m3u8",
    sourceUrl: "https://shymbulak.com/live/",
  },
  {
    id: "shymbulak-middle",
    name: "Средняя станция",
    streamUrl: "https://ipcam.kz:443/cam5/index.m3u8",
    sourceUrl: "https://shymbulak.com/live/",
  },
  {
    id: "shymbulak-glacier",
    name: "Ледник Богдановича",
    streamUrl: "https://ipcam.kz:443/cam6/index.m3u8",
    sourceUrl: "https://shymbulak.com/live/",
  },
];

// One resort navigation anchor represents the collection of three cameras.
// It deliberately does not imply three surveyed camera installation positions.
// Landmark reference: https://www.openstreetmap.org/way/171508693
export const publicWebcams: MapObject[] = [
  {
    id: "webcam-shymbulak",
    name: "Шымбулак · публичные камеры",
    kind: "webcam",
    longitude: 77.081388,
    latitude: 43.128476,
    district: "Медеуский",
    description:
      "Три публичных вида курорта: базовая и средняя станции, ледник Богдановича. Потоки опубликованы на официальном сайте Шымбулака.",
    isDemo: false,
    status: "3 публичных потока",
    address: "Горный курорт Шымбулак",
    sourceUrl: "https://shymbulak.com/live/",
    provider: "Shymbulak / ipcam.kz",
    locationNote:
      "Отметка — ориентир курорта. Точные места установки и направления камер не подтверждены.",
  },
];

export const additionalCameraLinks = [
  {
    name: "Заилийский Алатау · GEONET",
    url: "https://www.youtube.com/watch?v=MmlDKqnfEpY",
    note: "Каталог Cam-World указывает вид из Алматы. Место камеры и наличие эфира не подтверждены.",
  },
  {
    name: "Шымбулак · каталог World-Cam",
    url: "https://world-cam.ru/cams/web-camera-almaty-online/chimbulak-ski-resort/",
    note: "Каталог ссылается на те же камеры курорта.",
  },
  {
    name: "Шымбулак · средняя станция в каталоге",
    url: "https://world-cam.ru/cams/web-camera-almaty-online/ski-resort-shymbulak/",
    note: "Исправленная ссылка из присланного адреса.",
  },
  {
    name: "Шымбулак · ледник в каталоге",
    url: "https://world-cam.ru/cams/web-camera-almaty-online/chimbulak-ski-resort-ss/",
    note: "Страница источника World-Cam.",
  },
];

// Observed public 2GIS traffic URL. The app does not scrape or redistribute
// their traffic tiles or user reports; native MapGL integration needs a key.
export function twoGisTrafficUrl(
  point: { longitude: number; latitude: number } = {
    longitude: 76.945,
    latitude: 43.238,
  },
): string {
  const center = `${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}/12`;
  return `https://2gis.kz/almaty?m=${encodeURIComponent(center)}&traffic`;
}

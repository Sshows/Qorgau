export type ObjectKind = "incident" | "camera" | "patrol" | "place" | "police";
export type Severity = "high" | "medium" | "low";

export interface MapObject {
  id: string;
  name: string;
  kind: ObjectKind;
  longitude: number;
  latitude: number;
  district: string;
  description: string;
  isDemo: boolean;
  status?: string;
  severity?: Severity;
  address?: string;
  updatedAt?: string;
  sourceUrl?: string;
}

export interface DistrictPreset {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  height: number;
}

// Camera destinations, not surveyed district centroids or administrative boundaries.
// Eight district names: https://www.gov.kz/memleket/entities/almaty/activities/27965
export const city = { longitude: 76.935, latitude: 43.252, height: 23_000 };
export const districts: DistrictPreset[] = [
  {
    id: "alatau",
    name: "Алатауский",
    longitude: 76.833,
    latitude: 43.297,
    height: 11_000,
  },
  {
    id: "almaly",
    name: "Алмалинский",
    longitude: 76.911,
    latitude: 43.258,
    height: 7_000,
  },
  {
    id: "auezov",
    name: "Ауэзовский",
    longitude: 76.844,
    latitude: 43.23,
    height: 9_000,
  },
  {
    id: "bostandyk",
    name: "Бостандыкский",
    longitude: 76.906,
    latitude: 43.215,
    height: 10_000,
  },
  {
    id: "zhetysu",
    name: "Жетысуский",
    longitude: 76.924,
    latitude: 43.292,
    height: 9_000,
  },
  {
    id: "medeu",
    name: "Медеуский",
    longitude: 76.972,
    latitude: 43.245,
    height: 10_000,
  },
  {
    id: "nauryzbay",
    name: "Наурызбайский",
    longitude: 76.78,
    latitude: 43.202,
    height: 11_000,
  },
  {
    id: "turksib",
    name: "Турксибский",
    longitude: 76.974,
    latitude: 43.333,
    height: 12_000,
  },
];

const osmLink = (latitude: number, longitude: number) =>
  `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;

// Approximate landmark navigation points, checked against published geographic references.
// No police facilities, surveillance locations or camera streams are inferred from these places.
export const landmarks: MapObject[] = [
  {
    id: "place-republic-square",
    name: "Площадь Республики",
    kind: "place",
    longitude: 76.94528,
    latitude: 43.23833,
    district: "Бостандыкский",
    description:
      "Городской ориентир. Приблизительная точка для навигации по карте.",
    address: "Площадь Республики",
    isDemo: false,
    sourceUrl: osmLink(43.23833, 76.94528),
  },
  {
    id: "place-kok-tobe",
    name: "Кок-Тобе",
    kind: "place",
    longitude: 76.97611,
    latitude: 43.23306,
    district: "Медеуский",
    description: "Гора и городской ориентир в юго-восточной части Алматы.",
    address: "Кок-Тобе",
    isDemo: false,
    sourceUrl: osmLink(43.23306, 76.97611),
  },
  {
    id: "place-medeu",
    name: "Высокогорный комплекс Медеу",
    kind: "place",
    longitude: 77.05861,
    latitude: 43.1575,
    district: "Медеуский",
    description:
      "Спортивный комплекс в Малоалматинском ущелье. Ориентир для навигации.",
    address: "Ущелье Медеу",
    isDemo: false,
    sourceUrl: osmLink(43.1575, 77.05861),
  },
  {
    id: "place-cathedral",
    name: "Вознесенский собор",
    kind: "place",
    longitude: 76.95333,
    latitude: 43.25861,
    district: "Медеуский",
    description:
      "Исторический городской ориентир в парке имени 28 гвардейцев-панфиловцев.",
    address: "Парк имени 28 гвардейцев-панфиловцев",
    isDemo: false,
    sourceUrl: osmLink(43.25861, 76.95333),
  },
  {
    id: "place-stadium",
    name: "Центральный стадион",
    kind: "place",
    longitude: 76.92444,
    latitude: 43.23833,
    district: "Бостандыкский",
    description:
      "Спортивный городской ориентир. Точка обозначает комплекс стадиона.",
    address: "Центральный стадион, проспект Абая",
    isDemo: false,
    sourceUrl: osmLink(43.23833, 76.92444),
  },
  {
    id: "place-botanical-garden",
    name: "Главный ботанический сад",
    kind: "place",
    longitude: 76.915,
    latitude: 43.225,
    district: "Бостандыкский",
    description:
      "Ботанический сад Алматы. Приблизительная точка внутри территории сада.",
    address: "Главный ботанический сад",
    isDemo: false,
    sourceUrl: osmLink(43.225, 76.915),
  },
  {
    id: "place-president-park",
    name: "Парк Первого Президента",
    kind: "place",
    longitude: 76.887,
    latitude: 43.188,
    district: "Бостандыкский",
    description:
      "Городской парк в южной части Алматы, рядом с проспектом Аль-Фараби.",
    address: "Проспект Аль-Фараби и улица Навои",
    isDemo: false,
    sourceUrl: osmLink(43.188, 76.887),
  },
  {
    id: "place-almaty-two",
    name: "Вокзал Алматы-2",
    kind: "place",
    longitude: 76.9391,
    latitude: 43.2737,
    district: "Жетысуский",
    description: "Железнодорожный вокзал. Общедоступный городской ориентир.",
    address: "Вокзал Алматы-2, проспект Абылай хана",
    isDemo: false,
    sourceUrl: osmLink(43.2737, 76.9391),
  },
];

// All operational objects below are fictional. Times belong to a fixed demo scenario.
export const demoClock = "14:45";
export const incidents: MapObject[] = [
  {
    id: "incident-001",
    name: "ДТП · Абая / Байтурсынова",
    kind: "incident",
    longitude: 76.9276,
    latitude: 43.2409,
    district: "Бостандыкский",
    isDemo: true,
    description:
      "Учебное происшествие для проверки назначения ближайшего демо-экипажа. Реального сообщения о ДТП нет.",
    address: "Учебная точка: Абая / Байтурсынова",
    status: "Назначен экипаж",
    severity: "high",
    updatedAt: "14:42",
  },
  {
    id: "incident-002",
    name: "Сбой светофора · Толе би",
    kind: "incident",
    longitude: 76.9281,
    latitude: 43.2528,
    district: "Алмалинский",
    isDemo: true,
    description:
      "Вымышленная заявка о светофоре в демонстрационном сценарии. Не отражает состояние дорожной инфраструктуры.",
    address: "Учебная точка: Толе би / Сейфуллина",
    status: "В проверке",
    severity: "medium",
    updatedAt: "14:38",
  },
  {
    id: "incident-003",
    name: "Плановое перекрытие · площадь Республики",
    kind: "incident",
    longitude: 76.944,
    latitude: 43.2392,
    district: "Бостандыкский",
    isDemo: true,
    description:
      "Учебная точка планового ограничения движения. Реального перекрытия не объявляется.",
    address: "Учебная точка: площадь Республики",
    status: "Запланировано",
    severity: "low",
    updatedAt: "14:30",
  },
  {
    id: "incident-004",
    name: "Проверка освещения · Панфилова",
    kind: "incident",
    longitude: 76.9465,
    latitude: 43.2633,
    district: "Алмалинский",
    isDemo: true,
    description:
      "Завершённая учебная заявка для проверки фильтров и карточки события.",
    address: "Учебная точка: улица Панфилова",
    status: "Завершено",
    severity: "low",
    updatedAt: "14:24",
  },
  {
    id: "incident-005",
    name: "Проверка территории · ботанический сад",
    kind: "incident",
    longitude: 76.9164,
    latitude: 43.2246,
    district: "Бостандыкский",
    isDemo: true,
    description:
      "Синтетический сигнал для демонстрации работы со слоями и визуальным маршрутом.",
    address: "Учебная точка: территория ботанического сада",
    status: "Новый сигнал",
    severity: "medium",
    updatedAt: "14:44",
  },
];

export const cameras: MapObject[] = [
  {
    id: "camera-001",
    name: "Камера D-01 · Абая",
    kind: "camera",
    longitude: 76.9301,
    latitude: 43.2422,
    district: "Бостандыкский",
    isDemo: true,
    status: "Демо-точка",
    address: "Учебная точка: проспект Абая",
    description:
      "Вымышленное расположение камеры для проверки интерфейса. Видеопоток не подключён.",
  },
  {
    id: "camera-002",
    name: "Камера D-02 · Республика",
    kind: "camera",
    longitude: 76.9472,
    latitude: 43.2388,
    district: "Бостандыкский",
    isDemo: true,
    status: "Демо-точка",
    address: "Учебная точка: площадь Республики",
    description:
      "Вымышленное расположение камеры. Наличие реальной камеры в этой точке не подтверждается; видеопотока нет.",
  },
  {
    id: "camera-003",
    name: "Камера D-03 · Толе би",
    kind: "camera",
    longitude: 76.9227,
    latitude: 43.2529,
    district: "Алмалинский",
    isDemo: true,
    status: "Демо-точка",
    address: "Учебная точка: улица Толе би",
    description:
      "Синтетическая камера демонстрационного слоя. Видео и распознавание лиц отсутствуют.",
  },
  {
    id: "camera-004",
    name: "Камера D-04 · Панфилова",
    kind: "camera",
    longitude: 76.9487,
    latitude: 43.2639,
    district: "Алмалинский",
    isDemo: true,
    status: "Демо-точка",
    address: "Учебная точка: улица Панфилова",
    description:
      "Синтетическая точка для проверки выбора объектов на карте. Видеопоток не подключён.",
  },
  {
    id: "camera-005",
    name: "Камера D-05 · Достык",
    kind: "camera",
    longitude: 76.9601,
    latitude: 43.2424,
    district: "Медеуский",
    isDemo: true,
    status: "Нет сигнала · демо",
    address: "Учебная точка: проспект Достык",
    description:
      "Вымышленная камера со сценарием отсутствия сигнала. Не описывает работу реальной системы.",
  },
  {
    id: "camera-006",
    name: "Камера D-06 · Сад",
    kind: "camera",
    longitude: 76.9142,
    latitude: 43.2291,
    district: "Бостандыкский",
    isDemo: true,
    status: "Демо-точка",
    address: "Учебная точка: ботанический сад",
    description:
      "Синтетическая камера для демонстрации слоя. Реального видео и доступа к камерам нет.",
  },
];

export const patrols: MapObject[] = [
  {
    id: "patrol-001",
    name: "Экипаж D-01",
    kind: "patrol",
    longitude: 76.9322,
    latitude: 43.244,
    district: "Бостандыкский",
    isDemo: true,
    status: "Свободен",
    updatedAt: "14:45",
    description:
      "Вымышленный экипаж. Статическая учебная позиция; персональные данные и реальное отслеживание отсутствуют.",
  },
  {
    id: "patrol-002",
    name: "Экипаж D-02",
    kind: "patrol",
    longitude: 76.9174,
    latitude: 43.2574,
    district: "Алмалинский",
    isDemo: true,
    status: "Свободен",
    updatedAt: "14:45",
    description:
      "Вымышленный экипаж для расчёта ближайшей учебной точки по прямой, без учёта дорог.",
  },
  {
    id: "patrol-003",
    name: "Экипаж D-03",
    kind: "patrol",
    longitude: 76.9588,
    latitude: 43.2514,
    district: "Медеуский",
    isDemo: true,
    status: "На задании",
    updatedAt: "14:45",
    description:
      "Демо-экипаж со статусом занят. Не представляет реальные полицейские ресурсы.",
  },
  {
    id: "patrol-004",
    name: "Экипаж D-04",
    kind: "patrol",
    longitude: 76.9059,
    latitude: 43.2249,
    district: "Бостандыкский",
    isDemo: true,
    status: "Свободен",
    updatedAt: "14:45",
    description:
      "Вымышленный экипаж. Позиция зафиксирована в учебном сценарии на 14:45.",
  },
];

export const objects: MapObject[] = [
  ...incidents,
  ...cameras,
  ...patrols,
  ...landmarks,
];

export const objectAliases: Record<string, string[]> = {
  "place-republic-square": [
    "новая площадь",
    "площадь независимости",
    "republic square",
    "respublika",
  ],
  "place-kok-tobe": [
    "коктобе",
    "кок тобе",
    "кок тюбе",
    "көктөбе",
    "kok tobe",
    "koktobe",
  ],
  "place-medeu": ["медеу", "медео", "каток", "medeu", "medeo"],
  "place-cathedral": [
    "собор зенкова",
    "зенков",
    "панфиловский парк",
    "ascension cathedral",
  ],
  "place-stadium": ["стадион", "central stadium", "орталық стадион"],
  "place-botanical-garden": [
    "ботсад",
    "ботанический сад",
    "ботаникалық бақ",
    "botanical garden",
  ],
  "place-president-park": ["парк первого президента", "first president park"],
  "place-almaty-two": [
    "алматы 2",
    "алматы ii",
    "алма ата 2",
    "almaty 2",
    "almaty ii",
    "вокзал",
  ],
};

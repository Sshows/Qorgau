import test from "node:test";
import assert from "node:assert/strict";
import {
  cameras,
  districts,
  incidents,
  landmarks,
  objects,
  patrols,
  type MapObject,
} from "./data";
import {
  distanceKm,
  isWithinAlmaty,
  nearestPatrol,
  parseCoordinates,
  searchLocal,
} from "./domain";

test("latitude-first coordinates accept common separators and decimal comma", () => {
  const expected = { latitude: 43.25, longitude: 76.95 };
  for (const value of [
    "43.25, 76.95",
    "43.25 76.95",
    "(43.25; 76.95)",
    "[43.25,76.95]",
    "43,25; 76,95",
    "43,25 76,95",
  ]) {
    assert.deepEqual(parseCoordinates(value), expected, value);
  }
});

test("coordinates reject malformed input, non-finite values, reversed order and places outside Almaty", () => {
  for (const value of [
    "",
    "43.25",
    "43.25,76.95,1",
    "43,25,76,95",
    "43.25 76.95 garbage",
    "NaN 76.95",
    "Infinity 76.95",
    "76.95 43.25",
    "43.61 76.95",
    "43.25 77.31",
    "51.169 71.449",
  ]) {
    assert.equal(parseCoordinates(value), null, value);
  }
  assert.deepEqual(parseCoordinates("42.8 76.5"), {
    latitude: 42.8,
    longitude: 76.5,
  });
  assert.deepEqual(parseCoordinates("43.6 77.3"), {
    latitude: 43.6,
    longitude: 77.3,
  });
});

test("local search resolves aliases, punctuation, multiple words and Ё normalization", () => {
  assert.equal(searchLocal("Коктобе")[0]?.id, "place-kok-tobe");
  assert.equal(searchLocal("Медео")[0]?.id, "place-medeu");
  assert.equal(searchLocal("Алматы 2")[0]?.id, "place-almaty-two");
  assert.equal(searchLocal("Шымбулак")[0]?.id, "webcam-shymbulak");
  assert.equal(searchLocal("Шымбулак")[0]?.isDemo, false);
  assert.equal(
    searchLocal("ботаничёский сад")[0]?.id,
    "place-botanical-garden",
  );
  assert.equal(searchLocal("Площадь Республики")[0], landmarks[0]);
  assert.ok(
    searchLocal("Бостандыкский район").every(
      (object) => object.district === "Бостандыкский",
    ),
  );
  assert.deepEqual(searchLocal("   "), []);
  assert.deepEqual(searchLocal("неизвестный адрес 99999"), []);
});

test("nearest patrol uses geographic distance, preserves references and handles unavailable candidates", () => {
  const target = { latitude: 43.25, longitude: 76.95 };
  const base: MapObject = {
    id: "test",
    name: "Test",
    kind: "patrol",
    district: "Медеуский",
    description: "Test",
    isDemo: true,
    ...target,
  };
  const north: MapObject = {
    ...base,
    id: "north",
    latitude: target.latitude + 0.01,
  };
  const east: MapObject = {
    ...base,
    id: "east",
    longitude: target.longitude + 0.01,
  };
  const result = nearestPatrol(target, [north, east]);
  assert.equal(result?.patrol, east);
  assert.ok(
    (result?.distanceKm ?? 0) > 0.8 && (result?.distanceKm ?? 10) < 0.82,
  );
  assert.equal(nearestPatrol(target, []), null);
  assert.equal(
    nearestPatrol(target, [
      { ...base, kind: "camera" },
      { ...base, latitude: NaN },
    ]),
    null,
  );
  assert.equal(nearestPatrol({ latitude: 51, longitude: 71 }, [base]), null);
  assert.equal(nearestPatrol(target, [base])?.distanceKm, 0);
  assert.equal(distanceKm(target, target), 0);
});

test("catalog keeps all operational data fictional and navigation points inside the region", () => {
  assert.equal(districts.length, 8);
  assert.equal(landmarks.length, 8);
  assert.equal(incidents.length, 5);
  assert.equal(cameras.length, 6);
  assert.equal(patrols.length, 4);
  assert.equal(
    new Set(objects.map((object) => object.id)).size,
    objects.length,
  );
  assert.ok(
    [...incidents, ...cameras, ...patrols].every((object) => object.isDemo),
  );
  assert.ok(objects.every(isWithinAlmaty));
  assert.ok(
    landmarks.every((object) =>
      object.sourceUrl?.startsWith("https://www.openstreetmap.org/"),
    ),
  );
  assert.ok(cameras.every((object) => !object.sourceUrl));
});

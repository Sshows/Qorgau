import test from "node:test";
import assert from "node:assert/strict";
import {
  checkGithub,
  normalizeHandle,
  parsePlaces,
  profileLinks,
} from "./publicSearch";

test("handles accept a single known username and reject personal identifiers or URL injection", () => {
  assert.equal(normalizeHandle(" @sherlock-project "), "sherlock-project");
  for (const value of [
    "",
    "name surname",
    "a@example.com",
    "+77010000000",
    "77010000000",
    "https://example.com",
    "../../x",
    "<script>",
    "a".repeat(65),
  ])
    assert.throws(() => normalizeHandle(value), value);
  assert.equal(profileLinks("a.b")[0].status, "incompatible");
  assert.equal(
    profileLinks("sherlock-project").find((row) => row.provider === "Telegram")
      ?.url,
    null,
  );
  assert.equal(profileLinks("OpenOSINT").length, 5);
  assert.ok(
    profileLinks("OpenOSINT").every((row) => row.status === "unverified"),
  );
});

test("API confirms only an exact public account, never infers identity or treats errors as absence", async () => {
  const signal = new AbortController().signal;
  const request = (body: object, status = 200) =>
    (async () =>
      new Response(JSON.stringify(body), { status })) as typeof fetch;
  const result = await checkGithub(
    "sherlock-project",
    signal,
    request({
      login: "sherlock-project",
      html_url: "https://github.com/sherlock-project",
      type: "Organization",
      email: "not-retained@example.com",
      location: "not-retained",
    }),
  );
  assert.equal(result.status, "found");
  assert.deepEqual(Object.keys(result).sort(), [
    "note",
    "provider",
    "status",
    "url",
  ]);
  assert.equal(
    (await checkGithub("test", signal, request({}, 404))).status,
    "missing",
  );
  assert.equal(
    (await checkGithub("test", signal, request({}, 403))).status,
    "unavailable",
  );
  assert.equal(
    (
      await checkGithub(
        "test",
        signal,
        request({
          login: "another",
          type: "User",
          html_url: "https://github.com/another",
        }),
      )
    ).status,
    "unavailable",
  );
  assert.equal(
    (
      await checkGithub(
        "test",
        signal,
        request({
          login: "test",
          type: "User",
          html_url: "javascript:alert(1)",
        }),
      )
    ).status,
    "unavailable",
  );
  let called = false;
  await checkGithub("a.b", signal, (async () => {
    called = true;
    throw new Error("should not fetch");
  }) as typeof fetch);
  assert.equal(called, false);
});

test("place parsing bounds results, deduplicates and validates OSM source links", () => {
  const feature = {
    geometry: { type: "Point", coordinates: [76.95, 43.25] },
    properties: {
      osm_type: "N",
      osm_id: 123,
      name: "Стадион",
      street: "Абая",
      housenumber: "1",
      city: "Алматы",
    },
  };
  const response = {
    features: [
      feature,
      feature,
      { ...feature, geometry: { type: "Point", coordinates: [71.4, 51.1] } },
      {
        ...feature,
        properties: { ...feature.properties, osm_type: "evil", osm_id: "../" },
      },
      null,
    ],
  };
  const places = parsePlaces(response);
  assert.equal(places.length, 1);
  assert.equal(places[0].sourceUrl, "https://www.openstreetmap.org/node/123");
  assert.equal(places[0].isDemo, false);
  assert.equal(places[0].address, "Абая, 1, Алматы");
  assert.deepEqual(parsePlaces({ features: "wrong" }), []);
});

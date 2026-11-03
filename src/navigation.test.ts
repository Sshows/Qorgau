import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHash, filterRouteValues } from "./navigation";
test("dashboard camera drill-down survives a direct link and preserves Unicode status", () => {
  const hash = routeHash("cameras", {
    status: "Доступна",
    district: "Медеуский",
  });
  const r = parseRoute(hash);
  assert.equal(r.page, "cameras");
  assert.equal(r.params.get("status"), "Доступна");
  assert.equal(r.params.get("district"), "Медеуский");
});
test("event details and fallback routes do not reinterpret arbitrary pages", () => {
  const r = parseRoute(routeHash("events", {}, "demo-1"));
  assert.equal(r.entity, "demo-1");
  assert.equal(r.page, "events");
  assert.equal(parseRoute("#unknown").page, "overview");
});
test("edit and map navigation parameters never replace event filters", () => {
  assert.deepEqual(
    filterRouteValues(
      new URLSearchParams("edit=1&camera=cam1&latitude=43.25"),
      { district: "", status: "" },
    ),
    {},
  );
  assert.deepEqual(
    filterRouteValues(new URLSearchParams("district=Медеуский&edit=1"), {
      district: "",
      status: "",
    }),
    { district: "Медеуский" },
  );
  assert.equal(parseRoute("#events/%broken").entity, "");
});

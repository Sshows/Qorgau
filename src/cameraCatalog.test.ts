import assert from "node:assert/strict";
import test from "node:test";
import { verifiedCameraCatalog } from "./cameraCatalog.js";
import { seedCameras } from "./operations.js";

test("real public catalogue preserves official streams and separates formats", () => {
  assert.ok(verifiedCameraCatalog.length >= 27);
  assert.equal(new Set(verifiedCameraCatalog.map((c) => c.id)).size, verifiedCameraCatalog.length);
  assert.equal(new Set(verifiedCameraCatalog.map((c) => c.stream_url)).size, verifiedCameraCatalog.length);
  for (const seed of seedCameras) assert.ok(verifiedCameraCatalog.some((c) => c.id === seed.id && c.stream_url === seed.stream_url));
  for (const c of verifiedCameraCatalog) {
    assert.equal(c.is_demo, false);
    assert.equal(c.status, "Не проверена", "transport success must not be published as playback success");
    assert.equal(c.checked_at, null);
    assert.ok(c.city && c.name && c.source_url && c.stream_url);
    for (const value of [c.source_url, c.stream_url]) {
      const url = new URL(value);
      assert.equal(url.protocol, "https:");
      assert.equal(url.username + url.password, "");
      assert.ok(!/[?&](token|key|api_key|auth)=/i.test(value), "catalogue must not embed expiring credentials");
    }
    if (c.stream_type === "hls") assert.ok(new URL(c.stream_url).pathname.endsWith(".m3u8"));
    if (c.transport_checked_at) assert.ok(Number.isFinite(Date.parse(c.transport_checked_at)));
  }
  assert.ok(!verifiedCameraCatalog.some((c) => c.id === "youtube-alatau"), "known unavailable YouTube stream is excluded from the usable catalogue");
  assert.equal(verifiedCameraCatalog.filter((c) => c.stream_type === "image").length, 7);
});

test("camera coordinates have explicit provenance and other cities are not attributed to Almaty", () => {
  for (const camera of verifiedCameraCatalog) {
    assert.equal(camera.latitude === null, camera.longitude === null);
    if (camera.latitude !== null && camera.longitude !== null) {
      assert.ok(Math.abs(camera.latitude) <= 90 && Math.abs(camera.longitude) <= 180);
      assert.match(camera.location_note, /node\.windy\.com\/webcams\/v2\.0\/detail\//);
      assert.match(camera.location_note, /не подтверждена/);
    }
    if (camera.id.startsWith("xcom-")) {
      assert.equal(camera.city, "Актау");
      assert.equal(camera.district, "");
      assert.equal(camera.latitude, null, "approximate aggregator points must not become installation coordinates");
      assert.equal(new URL(camera.stream_url).hostname, "cam.xcom.kz");
    }
    if (["windy-1793908561", "windy-1793908563", "windy-1793908077"].includes(camera.id)) assert.equal(camera.city, "Алматинская область");
  }
  assert.equal(verifiedCameraCatalog.filter((c) => c.latitude !== null).length, 7);
});

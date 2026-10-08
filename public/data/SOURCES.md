# Central Almaty public-map datasets

These three GeoJSON files contain a one-time, bounded OpenStreetMap extract for the QORGAU Vision demonstration. They are **data under ODbL 1.0**, independent of the application source-code license.

Required map attribution: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright).

Data license: [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Modified or redistributed derivative databases remain subject to ODbL; do not label these data as MIT. Each feature retains an OSM ID and direct source link.

## Scope and acquisition

- Query area, south/west/north/east: `43.23, 76.92, 43.26, 76.96`.
- Provider: [Overpass API](https://overpass-api.de/api/interpreter).
- Buildings/roads OSM snapshot: `2026-10-08T18:54:51Z`.
- Police-object OSM snapshot: `2026-10-08T18:56:51Z`.
- Two manually initiated bounded POST queries; no recurring public Overpass backend is used by the app. [Overpass public-instance usage guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

Building/road query:

```overpass
[out:json][timeout:30][maxsize:67108864];
(
  way["building"](43.23,76.92,43.26,76.96);
  way["highway"](43.23,76.92,43.26,76.96);
);
out tags geom;
```

Public police-object query:

```overpass
[out:json][timeout:15][maxsize:16777216];
nwr["amenity"="police"](43.23,76.92,43.26,76.96);
out tags center;
```

## Files and transformations

`almaty-buildings.geojson` contains **800** closed OSM way footprints selected across a 10×10 grid from 2,641 eligible closed building ways. All polygon coordinates come from OSM; ring direction is normalized to GeoJSON's counterclockwise outer-ring convention. OSM building relations are not included. The sample is deliberately incomplete to keep the demo light.

Building `height` is in metres, with explicit provenance:

- **208** selected buildings: valid `height` tag (`height_source: osm:height`, `height_estimated: false`). This is a community-entered value, not a surveyed guarantee.
- **470**: estimated from `building:levels × 3 m` (`height_source: estimated:osm_building_levels_x_3m`, `height_estimated: true`).
- **122**: display fallback of **12 m** where height and level count are missing (`height_source: estimated:display_fallback_12m`, `height_estimated: true`).

`min_height` is copied from the tag where valid; otherwise it is 0. The display estimate is clearly a height assumption; the building footprint geometry is real OSM geometry.

`almaty-roads.geojson` contains **500** actual OSM LineString ways selected across the same grid from 2,597 ways with road or pedestrian-street highway classes. Major roads have priority within each cell. Footpaths, cycle paths, steps and other non-road classes are excluded. Geometry, highway class and available names/tags are copied from OSM. These lines are a display sample, not a complete routable road graph.

`almaty-police.geojson` contains **16** publicly mapped `amenity=police` objects. Names and addresses come only from public OSM tags. Unnamed objects use the neutral display label `Объект полиции (OSM)`. Nodes retain published coordinates; way/relation geometries use Overpass's approximate bounding-box center, explicitly marked by `center_is_approximate`. This is community map context, not an official police registry. Objects may be incomplete, duplicated, outdated or incorrectly tagged; no private data or live feeds are included.

The query selects ways intersecting the area, so complete way geometries can extend slightly beyond the query box. File-level `bbox`, where present, describes the actual saved coordinates; `query_bbox` describes the request area.

## Other map services used by the demo

- [Esri World Imagery service](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer): provider-managed satellite-image tiles. Preserve its returned credits. At acquisition time the metadata says `Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community`; provider terms govern imagery separately.
- [Re:Earth Terrain](https://github.com/reearth/reearth-terrain): public quantized-mesh terrain at `https://terrain.reearth.land/cesium-mesh/ellipsoid`. Its `layer.json` supplies credits for Re:Earth Terrain, Mapterhorn, EGM2008 (NGA), Protomaps and OpenStreetMap. Mapterhorn terrain data is CC BY 4.0. Preserve the provider's credits.
- [FOSSGIS OSRM](https://routing.openstreetmap.de/about.html): optional explicit-request route calculation using OpenStreetMap data. Respect a maximum of one request per second, preserve attribution and include a [fix the map](https://www.openstreetmap.org/edit) link. The bundled road sample is not used as a routing graph.

Application visual inspiration: [God's Eye View by Bilawal Sidhu](https://github.com/bilawalsidhu/gods-eye-view). Its [MIT source-code license](https://github.com/bilawalsidhu/gods-eye-view/blob/main/LICENSE) does not extend to upstream third-party data/assets. No upstream bundled non-commercial datasets or models are included in these GeoJSON assets.

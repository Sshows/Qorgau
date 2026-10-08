import { useEffect, useRef, useState } from "react";
import {
  ArcGisMapServerImageryProvider,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Credit,
  DistanceDisplayCondition,
  EllipsoidTerrainProvider,
  Entity,
  GeoJsonDataSource,
  HeightReference,
  HeadingPitchRange,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  Matrix4,
  OpenStreetMapImageryProvider,
  PolylineGlowMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SceneMode,
  VerticalOrigin,
  Viewer,
} from "cesium";
import type { MapObject } from "./data";
import "cesium/Build/Cesium/Widgets/widgets.css";

export interface MapViewProps {
  objects: MapObject[];
  visibleKinds: string[];
  selected: MapObject | null;
  focus: {
    longitude: number;
    latitude: number;
    height: number;
    nonce: number;
  } | null;
  basemap: "satellite" | "streets";
  is3D: boolean;
  buildings: boolean;
  roads: boolean;
  route: { points: number[][]; label: string } | null;
  onSelect: (object: MapObject) => void;
  onStatus: (status: string) => void;
}

const ALMATY = {
  longitude: 76.945,
  latitude: 43.238,
  height: 11000,
  groundHeight: 800,
};
const COLORS: Record<MapObject["kind"], string> = {
  camera: "#55b8ff",
  webcam: "#61d6de",
  incident: "#ff9265",
  patrol: "#74edb0",
  police: "#be9cff",
  place: "#d4e0ec",
};

function objectColor(object: Pick<MapObject, "kind" | "severity">): string {
  return object.kind === "incident" && object.severity === "high"
    ? "#ff6171"
    : COLORS[object.kind];
}

function numericHeight(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const height = Number.parseFloat(String(value));
  return Number.isFinite(height) && height > 0 ? height : null;
}

export default function MapView(props: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const credits = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const objectsRef = useRef(new Map<string, MapObject>());
  const latest = useRef(props);
  const buildingSource = useRef<GeoJsonDataSource | null>(null);
  const roadSource = useRef<GeoJsonDataSource | null>(null);
  const loadVectorsRef = useRef<((kind: "buildings" | "roads") => void) | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  latest.current = props;

  useEffect(() => {
    if (!container.current || !credits.current) return;
    let disposed = false;
    let viewer: Viewer | undefined;
    let handler: ScreenSpaceEventHandler | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let removeRenderError: (() => void) | undefined;
    let removeTerrainError: (() => void) | undefined;
    let terrainFailed = false;
    latest.current.onStatus("Загрузка карты Алматы…");
    setFailure(null);
    setReady(false);

    try {
      viewer = new Viewer(container.current, {
        animation: false,
        timeline: false,
        fullscreenButton: false,
        baseLayerPicker: false,
        baseLayer: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        creditContainer: credits.current,
        terrainProvider: new EllipsoidTerrainProvider(),
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        shadows: false,
        msaaSamples: 2,
      });
      viewerRef.current = viewer;
      viewer.scene.globe.baseColor = Color.fromCssColorString("#10262f");
      viewer.scene.globe.enableLighting = false;
      viewer.scene.backgroundColor = Color.fromCssColorString("#07121c");
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 25000000;
      viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
      viewer.camera.lookAt(
        Cartesian3.fromDegrees(
          ALMATY.longitude,
          ALMATY.latitude,
          ALMATY.groundHeight,
        ),
        new HeadingPitchRange(0, CesiumMath.toRadians(-50), ALMATY.height),
      );
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      viewer.canvas.setAttribute(
        "aria-label",
        "Интерактивная карта Алматы. Перемещение мышью, масштаб колёсиком.",
      );
      viewer.canvas.setAttribute("tabindex", "0");
      handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(
        (movement: ScreenSpaceEventHandler.PositionedEvent) => {
          if (!viewer || viewer.isDestroyed()) return;
          const picked = viewer.scene.pick(movement.position);
          const entity = picked?.id;
          if (entity instanceof Entity && typeof entity.id === "string") {
            const object = objectsRef.current.get(entity.id);
            if (object) latest.current.onSelect(object);
          }
        },
        ScreenSpaceEventType.LEFT_CLICK,
      );
      // Keep the native camera gesture but suppress Cesium's entity tracking on double-click.
      viewer.screenSpaceEventHandler.removeInputAction(
        ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
      );
      removeRenderError = viewer.scene.renderError.addEventListener(() => {
        if (disposed) return;
        const message =
          "Не удалось отрисовать 3D-карту. Попробуйте перезагрузить её.";
        setFailure(message);
        latest.current.onStatus("Ошибка отображения карты");
      });
      resizeObserver = new ResizeObserver(() => {
        if (viewer && !viewer.isDestroyed()) {
          viewer.resize();
          viewer.scene.requestRender();
        }
      });
      resizeObserver.observe(container.current);
      setReady(true);
      latest.current.onStatus("Карта готова");

      // Relief is optional: the globe and city markers work while terrain is loading.
      const activeViewer = viewer;
      void CesiumTerrainProvider.fromUrl(
        "https://terrain.reearth.land/cesium-mesh/ellipsoid",
        {
          requestVertexNormals: true,
          credit: new Credit(
            '<a href="https://reearth.io/" target="_blank" rel="noopener noreferrer">Terrain · Re:Earth</a>',
            true,
          ),
        },
      )
        .then((terrain) => {
          if (disposed || activeViewer.isDestroyed()) return;
          activeViewer.terrainProvider = terrain;
          removeTerrainError = terrain.errorEvent.addEventListener(() => {
            if (disposed || terrainFailed || activeViewer.isDestroyed()) return;
            terrainFailed = true;
            activeViewer.terrainProvider = new EllipsoidTerrainProvider();
            latest.current.onStatus(
              "Рельеф недоступен · карта работает без него",
            );
            activeViewer.scene.requestRender();
          });
          activeViewer.scene.requestRender();
        })
        .catch(() => {
          if (!disposed)
            latest.current.onStatus(
              "Рельеф недоступен · карта работает без него",
            );
        });
    } catch {
      const message =
        "Для карты нужен браузер с поддержкой WebGL. Проверьте аппаратное ускорение и попробуйте снова.";
      setFailure(message);
      latest.current.onStatus("Не удалось запустить карту");
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      removeRenderError?.();
      removeTerrainError?.();
      if (handler && !handler.isDestroyed()) handler.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      if (viewerRef.current === viewer) viewerRef.current = null;
      objectsRef.current.clear();
      buildingSource.current = null;
      roadSource.current = null;
    };
  }, [retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    let disposed = false;
    let removeError: (() => void) | undefined;
    let switchedToFallback = false;
    const showProvider = (
      provider: ArcGisMapServerImageryProvider | OpenStreetMapImageryProvider,
    ) => {
      if (disposed || viewer.isDestroyed()) return;
      removeError?.();
      viewer.imageryLayers.removeAll(true);
      viewer.imageryLayers.add(new ImageryLayer(provider));
      removeError = provider.errorEvent.addEventListener(() => {
        if (disposed || viewer.isDestroyed() || switchedToFallback) return;
        switchedToFallback = true;
        if (provider instanceof ArcGisMapServerImageryProvider) {
          latest.current.onStatus(
            "Спутниковые снимки недоступны · включена карта улиц",
          );
          showProvider(
            new OpenStreetMapImageryProvider({
              url: "https://tile.openstreetmap.org/",
            }),
          );
        } else {
          latest.current.onStatus(
            "Не удалось загрузить подложку · проверьте соединение",
          );
        }
        viewer.scene.requestRender();
      });
      viewer.scene.requestRender();
    };
    if (props.basemap === "streets") {
      showProvider(
        new OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        }),
      );
    } else {
      void ArcGisMapServerImageryProvider.fromUrl(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        {
          enablePickFeatures: false,
        },
      )
        .then(showProvider)
        .catch(() => {
          if (disposed || viewer.isDestroyed()) return;
          switchedToFallback = true;
          latest.current.onStatus(
            "Спутниковые снимки недоступны · включена карта улиц",
          );
          showProvider(
            new OpenStreetMapImageryProvider({
              url: "https://tile.openstreetmap.org/",
            }),
          );
        });
    }
    return () => {
      disposed = true;
      removeError?.();
    };
  }, [ready, props.basemap, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    for (const id of objectsRef.current.keys()) viewer.entities.removeById(id);
    objectsRef.current.clear();
    for (const object of props.objects) {
      const id = `qorgau-object:${object.id}`;
      objectsRef.current.set(id, object);
      const color = Color.fromCssColorString(objectColor(object));
      viewer.entities.add({
        id,
        name: object.name,
        position: Cartesian3.fromDegrees(object.longitude, object.latitude),
        show: latest.current.visibleKinds.includes(object.kind),
        label: {
          text: object.name,
          font: "500 12px Inter, system-ui, sans-serif",
          fillColor: Color.WHITE,
          outlineColor: Color.fromCssColorString("#07131e"),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#07131e").withAlpha(0.78),
          backgroundPadding: new Cartesian2(7, 4),
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -22),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 8000),
        },
        point: {
          pixelSize: 11,
          color,
          outlineColor: Color.fromCssColorString("#07131e"),
          outlineWidth: 3,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    viewer.scene.requestRender();
  }, [ready, props.objects, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    for (const [id, object] of objectsRef.current) {
      const entity = viewer.entities.getById(id);
      if (!entity) continue;
      entity.show = props.visibleKinds.includes(object.kind);
      const isSelected = props.selected?.id === object.id;
      if (entity.point) {
        entity.point.pixelSize = new ConstantProperty(isSelected ? 18 : 11);
        entity.point.color = new ConstantProperty(Color.fromCssColorString(objectColor(object)));
        entity.point.outlineColor = new ConstantProperty(Color.fromCssColorString(isSelected ? "#e6fff8" : "#07131e"));
        entity.point.outlineWidth = new ConstantProperty(3);
      }
      if (entity.label) {
        entity.label.fillColor = new ConstantProperty(
          isSelected ? Color.fromCssColorString("#baffdf") : Color.WHITE,
        );
        entity.label.distanceDisplayCondition = new ConstantProperty(
          new DistanceDisplayCondition(0, isSelected ? 25000000 : 8000),
        );
      }
    }
    viewer.scene.requestRender();
  }, [ready, props.objects, props.visibleKinds, props.selected, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    const targetMode = props.is3D ? SceneMode.SCENE3D : SceneMode.SCENE2D;
    if (viewer.scene.mode !== targetMode) {
      if (props.is3D) viewer.scene.morphTo3D(0.6);
      else viewer.scene.morphTo2D(0.6);
    }
    viewer.scene.requestRender();
  }, [ready, props.is3D, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const focus = props.focus;
    if (!ready || !viewer || viewer.isDestroyed() || !focus) return;
    const fly = () => {
      if (viewer.isDestroyed()) return;
      const groundHeight =
        viewer.scene.globe.getHeight(
          Cartographic.fromDegrees(focus.longitude, focus.latitude),
        ) ??
        (viewer.terrainProvider instanceof EllipsoidTerrainProvider
          ? 0
          : ALMATY.groundHeight);
      viewer.camera.cancelFlight();
      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(
          Cartesian3.fromDegrees(focus.longitude, focus.latitude, groundHeight),
          0,
        ),
        {
          offset: new HeadingPitchRange(
            0,
            CesiumMath.toRadians(props.is3D ? -55 : -90),
            Math.max(100, focus.height),
          ),
          duration: 1.4,
        },
      );
      viewer.scene.requestRender();
    };
    if (viewer.scene.mode === SceneMode.MORPHING) {
      const removeListener = viewer.scene.morphComplete.addEventListener(() => {
        removeListener();
        fly();
      });
      return removeListener;
    }
    fly();
  }, [ready, props.focus, props.is3D, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    viewer.entities.removeById("qorgau-route");
    const route = props.route;
    if (route && route.points.length >= 2) {
      const coordinates = route.points.flatMap((point) => point.slice(0, 2));
      viewer.entities.add({
        id: "qorgau-route",
        name: route.label,
        polyline: {
          positions: Cartesian3.fromDegreesArray(coordinates),
          width: 5,
          clampToGround: true,
          material: new PolylineGlowMaterialProperty({
            color: Color.fromCssColorString("#70ffc2"),
            glowPower: 0.25,
            taperPower: 0.8,
          }),
        },
      });
    }
    viewer.scene.requestRender();
  }, [ready, props.route, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    let disposed = false;
    const abort = new AbortController();
    const pending = new Set<"buildings" | "roads">();
    // Read only bundled public OpenStreetMap geometry; missing files never generate invented footprints.
    const loadVector = async (kind: "buildings" | "roads") => {
      const sourceRef = kind === "buildings" ? buildingSource : roadSource;
      if (
        disposed ||
        viewer.isDestroyed() ||
        sourceRef.current ||
        pending.has(kind)
      )
        return;
      pending.add(kind);
      try {
        const response = await fetch(`/data/almaty-${kind}.geojson`, {
          signal: abort.signal,
        });
        if (!response.ok) throw new Error("Vector data unavailable");
        const geoJson = await response.json();
        const source = await GeoJsonDataSource.load(geoJson, {
          clampToGround: true,
          stroke: Color.fromCssColorString(
            kind === "roads" ? "#5aa1b0" : "#8cd3d9",
          ).withAlpha(0.65),
          strokeWidth: kind === "roads" ? 1.5 : 1,
          fill: Color.fromCssColorString("#477b89").withAlpha(0.6),
          credit: new Credit(
            '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
            true,
          ),
        });
        if (disposed || viewer.isDestroyed()) return;
        if (kind === "buildings") {
          for (const entity of source.entities.values) {
            if (!entity.polygon) continue;
            const values = entity.properties?.getValue(
              viewer.clock.currentTime,
            ) as Record<string, unknown> | undefined;
            const givenHeight = numericHeight(values?.height);
            const levels = numericHeight(values?.["building:levels"]);
            // Exact OSM footprints; extrusions are approximate where OSM does not supply height.
            const height = Math.min(
              250,
              givenHeight ?? (levels ? levels * 3 : 9),
            );
            entity.polygon.height = new ConstantProperty(0);
            entity.polygon.heightReference = new ConstantProperty(
              HeightReference.CLAMP_TO_GROUND,
            );
            entity.polygon.extrudedHeight = new ConstantProperty(height);
            entity.polygon.extrudedHeightReference = new ConstantProperty(
              HeightReference.RELATIVE_TO_GROUND,
            );
            entity.polygon.outline = new ConstantProperty(false);
            entity.polygon.material = new ColorMaterialProperty(
              Color.fromCssColorString("#78adb3").withAlpha(0.68),
            );
          }
        }
        await viewer.dataSources.add(source);
        if (disposed || viewer.isDestroyed()) {
          if (!viewer.isDestroyed()) viewer.dataSources.remove(source, true);
          return;
        }
        sourceRef.current = source;
        source.show =
          kind === "buildings"
            ? latest.current.buildings
            : latest.current.roads;
        viewer.scene.requestRender();
      } catch {
        if (!disposed && !abort.signal.aborted) {
          latest.current.onStatus(
            kind === "buildings"
              ? "Данные зданий пока недоступны"
              : "Данные дорог пока недоступны",
          );
        }
      } finally {
        pending.delete(kind);
      }
    };
    const load = (kind: "buildings" | "roads") => {
      void loadVector(kind);
    };
    loadVectorsRef.current = load;
    return () => {
      disposed = true;
      abort.abort();
      if (loadVectorsRef.current === load) loadVectorsRef.current = null;
    };
  }, [ready, retry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    if (buildingSource.current) buildingSource.current.show = props.buildings;
    else if (props.buildings) loadVectorsRef.current?.("buildings");
    if (roadSource.current) roadSource.current.show = props.roads;
    else if (props.roads) loadVectorsRef.current?.("roads");
    viewer.scene.requestRender();
  }, [ready, props.buildings, props.roads, retry]);

  return (
    <>
      <div
        ref={container}
        className="cesium-map"
        style={{ position: "absolute", inset: 0 }}
      />
      <div
        ref={credits}
        className="map-credits"
        style={{
          position: "absolute",
          left: 14,
          bottom: 9,
          zIndex: 2,
          maxWidth: "calc(100% - 28px)",
        }}
      />
      {failure && (
        <div
          className="map-error"
          role="alert"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            gap: 16,
            textAlign: "center",
            padding: 32,
            background: "#0b1725",
            color: "#dcebf2",
            zIndex: 3,
          }}
        >
          <strong style={{ fontSize: 20 }}>Карта временно недоступна</strong>
          <p style={{ maxWidth: 420, margin: 0, lineHeight: 1.6 }}>{failure}</p>
          <button
            type="button"
            onClick={() => setRetry((count) => count + 1)}
            style={{
              justifySelf: "center",
              padding: "10px 18px",
              border: "1px solid #68dbad",
              background: "#123629",
              color: "#c8ffe9",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Перезагрузить карту
          </button>
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";

export interface PublicCameraSource {
  id?: string;
  name: string;
  streamUrl: string;
  sourceUrl: string;
  streamType?: "hls" | "youtube" | "image" | "external";
  embedAllowed?: boolean;
}

type PlaybackStatus =
  "idle" | "loading" | "ready" | "playing" | "paused" | "error";

interface PlaybackState {
  url: string;
  status: PlaybackStatus;
  message: string;
}

function HlsCameraPlayer({
  source,
  onPlayback,
}: {
  source: PublicCameraSource;
  onPlayback?: (status: 'Доступна' | 'Недоступна') => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({
    url: "",
    status: "idle",
    message: "",
  });
  const current =
    playback.url === source.streamUrl
      ? playback
      : { url: source.streamUrl, status: "idle" as const, message: "" };
  const connected =
    current.status === "loading" ||
    current.status === "ready" ||
    current.status === "playing" ||
    current.status === "paused";

  const disconnect = useCallback(() => {
    sessionRef.current += 1;
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  // Source selection never starts a network request. An active player is
  // disposed on source changes, panel closure and React StrictMode cleanup.
  useEffect(() => () => disconnect(), [disconnect, source.streamUrl]);

  const stop = () => {
    disconnect();
    setPlayback({
      url: source.streamUrl,
      status: "idle",
      message: "Трансляция отключена.",
    });
  };

  const connect = async () => {
    const video = videoRef.current;
    if (!video) return;
    disconnect();
    const session = sessionRef.current;
    const startupStartedAt = performance.now();
    const active = () => sessionRef.current === session;
    let hls: Hls | null = null;
    let usingHls = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const update = (status: PlaybackStatus, message = "") => {
      if (active()) setPlayback({ url: source.streamUrl, status, message });
      if (active() && status === 'playing') onPlayback?.('Доступна');
    };

    const fail = (
      message = "Поток сейчас недоступен. Откройте официальный источник или попробуйте позже.",
    ) => {
      if (!active()) return;
      disconnect();
      setPlayback({ url: source.streamUrl, status: "error", message });
      onPlayback?.('Недоступна');
    };

    const requestPlay = () => {
      if (!active()) return;
      void video.play().catch(() => {
        if (!active()) return;
        video.muted = true;
        void video.play().catch(() => {
          update(
            "ready",
            "Трансляция подключена. Нажмите ▶ в плеере, чтобы начать просмотр.",
          );
        });
      });
    };

    const onPlaying = () => {
      clearTimeout(timeout);
      update("playing");
    };
    const onLoadedData = () => {
      if (usingHls || !active()) return;
      clearTimeout(timeout);
      if (video.paused)
        update("ready", "Трансляция подключена. Нажмите ▶ в плеере.");
    };
    const onPause = () => {
      if (active() && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
        update("paused");
    };
    const onWaiting = () => update("loading", "Буферизация трансляции…");

    const attachHls = async () => {
      if (!active() || usingHls) return;
      usingHls = true;
      clearTimeout(timeout);
      update("loading", "Публичный источник может подключаться до 90 секунд. Просмотр можно отменить.");
      timeout = setTimeout(() => fail("Источник не начал воспроизведение за 90 секунд. Повторите попытку или откройте страницу источника."), Math.max(1, 90_000 - (performance.now() - startupStartedAt)));
      try {
        const { default: HlsPlayer } = await import("hls.js");
        if (!active()) return;
        if (!HlsPlayer.isSupported()) {
          fail(
            "Этот браузер не поддерживает просмотр потока. Откройте официальный источник.",
          );
          return;
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
        // The ESM package does not bundle a worker. Keep the player entirely
        // local rather than introducing an additional external worker URL.
        hls = new HlsPlayer({
          enableWorker: true,
          lowLatencyMode: false,
          capLevelToPlayerSize: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
          backBufferLength: 4,
          // Some public feeds publish ~34-second fragments. Keep a bounded
          // loading window without confusing HTTP success with playback.
          fragLoadPolicy: {
            default: {
              ...HlsPlayer.DefaultConfig.fragLoadPolicy.default,
              maxTimeToFirstByteMs: 60_000,
              maxLoadTimeMs: 90_000,
            },
          },
        });
        hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () => {
          if (active()) hls?.loadSource(source.streamUrl);
        });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          update("ready");
          requestPlay();
        });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal && active()) {
            console.warn("Public camera playback failed", { source: source.id || "public-camera", type: String(data.type).slice(0, 80), details: String(data.details).slice(0, 120) });
            fail();
          }
        });
        hls.attachMedia(video);
      } catch {
        fail();
      }
    };

    const onVideoError = () => {
      if (!active()) return;
      if (usingHls) fail();
      else void attachHls();
    };

    cleanupRef.current = () => {
      clearTimeout(timeout);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("error", onVideoError);
      hls?.destroy();
      hls = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("error", onVideoError);
    update("loading", "Подключение трансляции…");

    if (
      video.canPlayType("application/vnd.apple.mpegurl") ||
      video.canPlayType("application/x-mpegURL")
    ) {
      timeout = setTimeout(() => void attachHls(), 20_000);
      video.src = source.streamUrl;
      video.load();
      requestPlay();
    } else {
      await attachHls();
    }
  };

  const statusLabels: Record<PlaybackStatus, string> = {
    idle: "Просмотр отключён",
    loading: "Подключение",
    ready: "Готово к просмотру",
    playing: "Видео воспроизводится",
    paused: "Просмотр на паузе",
    error: "Трансляция недоступна",
  };

  return (
    <section
      className="public-camera-player"
      aria-label={`Публичная веб-камера: ${source.name}`}
    >
      <video
        key={source.streamUrl}
        ref={videoRef}
        className="public-camera-video"
        controls
        playsInline
        preload="none"
        aria-label={source.name}
      />
      <div className="public-camera-status" aria-live="polite">
        <span>{statusLabels[current.status]}</span>
        {current.message && (
          <p
            className={
              current.status === "error"
                ? "public-camera-error"
                : "public-camera-note"
            }
          >
            {current.message}
          </p>
        )}
      </div>
      <div className="public-camera-actions">
        {connected ? (
          <button className="public-camera-stop" type="button" onClick={stop}>
            Отключить трансляцию
          </button>
        ) : (
          <button
            className="public-camera-start"
            type="button"
            onClick={() => void connect()}
          >
            {current.status === "error"
              ? "Попробовать снова"
              : "Подключить трансляцию"}
          </button>
        )}
        <button type="button" className="public-camera-stop" onClick={() => void videoRef.current?.requestFullscreen?.().catch(() => {})}>На весь экран</button>
        <a
          className="public-camera-source"
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Страница источника ↗
        </a>
      </div>
      <p className="public-camera-note">
        Видео загружается после подключения. Доступность зависит от владельца
        камеры. Подключение публичного видео может занимать до 90 секунд; его можно отменить кнопкой выше.
      </p>
    </section>
  );
}

type PlayerProps = {
  source: PublicCameraSource;
  onPlayback?: (status: "Доступна" | "Недоступна") => void;
};
function SourceLink({ source }: { source: PublicCameraSource }) {
  return <a className="public-camera-source" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">Страница источника ↗</a>;
}
function ImageCameraPlayer({ source, onPlayback }: PlayerProps) {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loadedAt, setLoadedAt] = useState("");
  const [error, setError] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => setRevision((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, [connected]);
  const imageUrl = new URL(source.streamUrl);
  imageUrl.searchParams.set("qorgau_refresh", String(revision));
  return <section className="public-camera-player" aria-label={`Публичный снимок: ${source.name}`}>
    <div className="public-camera-image-frame" ref={frameRef}>
      {connected ? <img key={revision} className="public-camera-image" src={imageUrl.href} alt={`Публичный снимок: ${source.name}`} referrerPolicy="no-referrer" onLoad={() => { setLoadedAt(new Date().toLocaleString("ru-RU")); setError(false); onPlayback?.("Доступна"); }} onError={() => { setError(true); onPlayback?.("Недоступна"); }} /> : <div className="public-camera-placeholder">Снимок загружается по запросу</div>}
    </div>
    <div className="public-camera-status" aria-live="polite"><span>{error ? "Снимок недоступен" : connected && loadedAt ? "Снимок загружен" : "Просмотр отключён"}</span><p className={error ? "public-camera-error" : "public-camera-note"}>{error ? "Источник не загрузил изображение. Повторите запрос или откройте страницу источника." : loadedAt && connected ? `Получен в браузере: ${loadedAt}. Время съёмки источник может не сообщать.` : "Обновляемое изображение. Это не непрерывное видео."}</p></div>
    <div className="public-camera-actions">
      <button type="button" className="public-camera-start" onClick={() => { if (connected) { setRevision((n) => n + 1); } else { setLoadedAt(""); setError(false); setConnected(true); setRevision(Date.now()); } }}>{connected ? "Обновить снимок" : "Показать снимок"}</button>
      {connected && <button type="button" className="public-camera-stop" onClick={() => setConnected(false)}>Отключить</button>}
      <button type="button" className="public-camera-stop" onClick={() => void frameRef.current?.requestFullscreen?.().catch(() => {})}>На весь экран</button>
      <SourceLink source={source} />
    </div>
    <p className="public-camera-note">Повторный запрос каждые 60 секунд, пока просмотр открыт. Частоту съёмки и свежесть кадра определяет источник.</p>
  </section>;
}
function YouTubeCameraPlayer({ source }: PlayerProps) {
  const [connected, setConnected] = useState(false);
  const url = new URL(source.streamUrl);
  const videoId = url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : url.searchParams.get("v");
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return <ExternalCameraPlayer source={source} />;
  return <section className="public-camera-player" aria-label={`YouTube-камера: ${source.name}`}>
    {connected ? <iframe className="public-camera-embed" title={source.name} src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <div className="public-camera-placeholder">Внешний YouTube-плеер</div>}
    <div className="public-camera-status"><span>{connected ? "Внешний плеер открыт" : "Просмотр отключён"}</span></div>
    <div className="public-camera-actions"><button type="button" className="public-camera-start" onClick={() => setConnected((v) => !v)}>{connected ? "Отключить плеер" : "Подключить YouTube"}</button><SourceLink source={source} /></div>
    <p className="public-camera-note">Наличие эфира и разрешение на встраивание определяет автор YouTube. Если видео ограничено, откройте источник. Загрузка внешнего плеера не подтверждает воспроизведение и не меняет статус камеры.</p>
  </section>;
}
function ExternalCameraPlayer({ source }: PlayerProps) {
  return <section className="public-camera-player"><div className="public-camera-placeholder">Просмотр у владельца источника</div><p className="public-camera-note">Источник не разрешает встроенный просмотр или формат не поддерживается. Доступность трансляции не подтверждена.</p><SourceLink source={source} /></section>;
}
export default function PublicCameraPlayer(props: PlayerProps) {
  if (props.source.embedAllowed === false || props.source.streamType === "external") return <ExternalCameraPlayer {...props} />;
  if (props.source.streamType === "image") return <ImageCameraPlayer key={props.source.streamUrl} {...props} />;
  if (props.source.streamType === "youtube") return <YouTubeCameraPlayer key={props.source.streamUrl} {...props} />;
  return <HlsCameraPlayer {...props} />;
}

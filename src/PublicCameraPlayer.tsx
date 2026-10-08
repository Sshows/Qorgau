import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";

export interface PublicCameraSource {
  name: string;
  streamUrl: string;
  sourceUrl: string;
}

type PlaybackStatus =
  "idle" | "loading" | "ready" | "playing" | "paused" | "error";

interface PlaybackState {
  url: string;
  status: PlaybackStatus;
  message: string;
}

export default function PublicCameraPlayer({
  source,
}: {
  source: PublicCameraSource;
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
    const active = () => sessionRef.current === session;
    let hls: Hls | null = null;
    let usingHls = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const update = (status: PlaybackStatus, message = "") => {
      if (active()) setPlayback({ url: source.streamUrl, status, message });
    };

    const fail = (
      message = "Поток сейчас недоступен. Откройте официальный источник или попробуйте позже.",
    ) => {
      if (!active()) return;
      disconnect();
      setPlayback({ url: source.streamUrl, status: "error", message });
    };

    const requestPlay = () => {
      if (!active()) return;
      void video.play().catch(() => {
        update(
          "ready",
          "Трансляция подключена. Нажмите ▶ в плеере, чтобы начать просмотр.",
        );
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
      update("loading", "Подключение трансляции…");
      timeout = setTimeout(() => fail(), 25_000);
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
          enableWorker: false,
          maxBufferLength: 12,
          backBufferLength: 0,
        });
        hls.on(HlsPlayer.Events.MEDIA_ATTACHED, () => {
          if (active()) hls?.loadSource(source.streamUrl);
        });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, () => {
          clearTimeout(timeout);
          update("ready");
          requestPlay();
        });
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (data.fatal) fail();
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
    playing: "Прямой эфир",
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
        <a
          className="public-camera-source"
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Официальный источник ↗
        </a>
      </div>
      <p className="public-camera-note">
        Видео загружается после подключения. Доступность зависит от владельца
        камеры.
      </p>
    </section>
  );
}

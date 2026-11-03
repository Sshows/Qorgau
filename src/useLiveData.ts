import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./useOperations";
import type { LiveDataSnapshot } from "./liveData";
const SNAPSHOT_KEY = "qorgau_live_snapshot_v1";
const empty: LiveDataSnapshot = {
  events: [],
  sources: [],
  generatedAt: "",
  refreshSeconds: 300,
  cached: false,
};
function readCachedSnapshot(): LiveDataSnapshot {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as LiveDataSnapshot;
    if (
      Array.isArray(parsed?.events) &&
      Array.isArray(parsed?.sources) &&
      typeof parsed.generatedAt === "string"
    )
      return parsed;
  } catch {}
  return empty;
}
export function useLiveData() {
  const [snapshot, setSnapshot] = useState(readCachedSnapshot),
    [busy, setBusy] = useState(() => !readCachedSnapshot().generatedAt),
    [error, setError] = useState(""),
    [ai, setAi] = useState(false);
  const pending = useRef(false),
    mounted = useRef(false),
    lastFetchRef = useRef(0);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const next = await api<LiveDataSnapshot>("public-data");
      if (!Array.isArray(next.events) || !Array.isArray(next.sources))
        throw new Error("Сервер вернул неверный формат источников.");
      lastFetchRef.current = Date.now();
      try {
        sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
      } catch {}
      if (mounted.current) {
        setSnapshot(next);
        setError("");
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Не удалось обновить источники.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    void api<{ publicAi?: boolean }>("health")
      .then((h) => {
        if (mounted.current) setAi(Boolean(h.publicAi));
      })
      .catch(() => {});
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 300000);
    const visible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastFetchRef.current > 120_000
      )
        void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  return { snapshot, busy, error, ai, refresh };
}

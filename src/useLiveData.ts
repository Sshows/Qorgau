import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./useOperations";
import type { LiveDataSnapshot } from "./liveData";
const empty: LiveDataSnapshot = {
  events: [],
  sources: [],
  generatedAt: "",
  refreshSeconds: 300,
  cached: false,
};
export function useLiveData() {
  const [snapshot, setSnapshot] = useState(empty),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [ai, setAi] = useState(false);
  const pending = useRef(false),
    mounted = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const next = await api<LiveDataSnapshot>("public-data");
      if (!Array.isArray(next.events) || !Array.isArray(next.sources))
        throw new Error("Сервер вернул неверный формат источников.");
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
      if (document.visibilityState === "visible") void refresh();
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

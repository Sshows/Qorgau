import { useCallback, useEffect, useState } from "react";
import {
  demoEvents,
  seedCameras,
  validateEvent,
  validateCamera,
} from "./operations";
import type {
  EventRecord,
  EventInput,
  CameraRecord,
  AuditRecord,
  Role,
} from "./operations";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  route: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/index?route=${encodeURIComponent(route)}`,
    {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(route === "ai" ? 58000 : 25000),
    },
  );
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(503, "Серверный API недоступен в этой сборке.");
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, value.error ?? "Ошибка сервера.");
  return value;
}
const key = "qorgau-local-demo-v2";
interface LocalData {
  events: EventRecord[];
  cameras: CameraRecord[];
  audit: AuditRecord[];
}
function readDemo(): LocalData {
  const stored = localStorage.getItem(key);
  if (!stored) return { events: demoEvents, cameras: seedCameras, audit: [] };
  const data = JSON.parse(stored) as LocalData;
  if (
    !Array.isArray(data.events) ||
    !Array.isArray(data.cameras) ||
    !Array.isArray(data.audit)
  )
    throw new Error(
      "Локальное DEMO-хранилище повреждено. Экспортируйте или очистите данные сайта в браузере.",
    );
  data.events.forEach((e) => {
    validateEvent(e);
    if (!e.is_demo)
      throw new Error("В локальном хранилище разрешены только DEMO-события.");
  });
  data.cameras.forEach(validateCamera);
  return data;
}
export function useOperations() {
  const [mode, setMode] = useState<"loading" | "demo" | "database" | "error">(
    "loading",
  );
  const [events, setEvents] = useState<EventRecord[]>([]),
    [cameras, setCameras] = useState<CameraRecord[]>([]),
    [audit, setAudit] = useState<AuditRecord[]>([]);
  const [user, setUser] = useState<{
    id: string;
    role: Role;
    display_name: string;
    email: string;
  } | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [updated, setUpdated] = useState("");
  const local = useCallback(() => {
    const data = readDemo();
    setEvents(data.events);
    setCameras(data.cameras);
    setAudit(data.audit);
    setMode("demo");
    setError("");
    setUpdated(new Date().toISOString());
  }, []);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const health = await api<{ configured: boolean; ai: boolean }>("health");
      setAiEnabled(health.ai);
      if (!health.configured) {
        local();
        return;
      }
      setMode("database");
      const me = await api<NonNullable<typeof user>>("me");
      setUser(me);
      const [e, c, a] = await Promise.all([
        api<EventRecord[]>("events"),
        api<CameraRecord[]>("cameras"),
        api<AuditRecord[]>("audit"),
      ]);
      setEvents(e);
      setCameras(c);
      setAudit(a);
      setUpdated(new Date().toISOString());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setEvents([]);
        setCameras([]);
        setAudit([]);
        setMode("database");
      } else {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setMode((m) => (m === "loading" ? "error" : m));
      }
    } finally {
      setBusy(false);
    }
  }, [local]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (mode !== "database" || !user) return;
    const id = setInterval(() => void refresh(), 60000);
    return () => clearInterval(id);
  }, [mode, user?.id, refresh]);
  useEffect(() => {
    if (mode !== "demo") return;
    const sync = (event: StorageEvent) => {
      if (event.key === key) {
        try {
          local();
        } catch (e) {
          setError(String(e));
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [mode, local]);
  function persist(data: LocalData) {
    localStorage.setItem(key, JSON.stringify(data));
    setEvents(data.events);
    setCameras(data.cameras);
    setAudit(data.audit);
    setUpdated(new Date().toISOString());
  }
  async function saveEvent(input: EventInput, existing?: EventRecord) {
    const event = validateEvent(input);
    if (mode === "demo") {
      event.is_demo = true;
      const now = new Date().toISOString();
      const current = readDemo();
      if (
        existing &&
        current.events.find((e) => e.id === existing.id)?.version !==
          existing.version
      )
        throw new Error("Событие изменено в другой вкладке. Обновите данные.");
      const record: EventRecord = {
        ...event,
        id: existing?.id ?? crypto.randomUUID(),
        created_at: existing?.created_at ?? now,
        updated_at: now,
        version: (existing?.version ?? 0) + 1,
      };
      persist({
        events: [record, ...current.events.filter((e) => e.id !== record.id)],
        cameras: current.cameras,
        audit: [
          {
            id: crypto.randomUUID(),
            entity_id: record.id,
            entity_type: "events",
            action: existing ? "UPDATE" : "INSERT",
            actor: "Локальный DEMO-оператор",
            created_at: now,
            before_data: existing ?? null,
            after_data: record,
          },
          ...current.audit,
        ],
      });
      return record;
    }
    if (mode !== "database") throw new Error("Хранилище недоступно.");
    const record = await api<EventRecord>(
      "events",
      existing ? "PATCH" : "POST",
      {
        ...event,
        ...(existing ? { id: existing.id, version: existing.version } : {}),
      },
    );
    await refresh();
    return record;
  }
  async function saveCamera(
    input: Omit<CameraRecord, "id" | "checked_at">,
    existing?: CameraRecord,
  ) {
    const camera = validateCamera(input);
    if (mode === "demo") {
      const current = readDemo(),
        now = new Date().toISOString();
      const record = {
        ...camera,
        id: existing?.id ?? crypto.randomUUID(),
        checked_at: null,
      };
      persist({
        events: current.events,
        cameras: [...current.cameras.filter((c) => c.id !== record.id), record],
        audit: [
          {
            id: crypto.randomUUID(),
            entity_id: record.id,
            entity_type: "cameras",
            action: existing ? "UPDATE" : "INSERT",
            actor: "Локальный DEMO-оператор",
            created_at: now,
            before_data: existing ?? null,
            after_data: record,
          },
          ...current.audit,
        ],
      });
      return;
    }
    if (mode !== "database") throw new Error("Хранилилище недоступно.");
    await api("cameras", existing ? "PATCH" : "POST", {
      ...camera,
      ...(existing ? { id: existing.id } : {}),
    });
    await refresh();
  }
  return {
    mode,
    events,
    cameras,
    audit,
    user,
    aiEnabled,
    error,
    busy,
    updated,
    refresh,
    local,
    saveEvent,
    saveCamera,
    canWrite: mode === "demo" || Boolean(user && user.role !== "observer"),
    canAdmin: mode === "demo" || user?.role === "admin",
    login: async (email: string, password: string) => {
      await api("login", "POST", { email, password });
      await refresh();
    },
    logout: async () => {
      try {
        await api("logout", "POST", {});
      } finally {
        setUser(null);
        setEvents([]);
        setCameras([]);
        setAudit([]);
      }
    },
  };
}

import { useState } from "react";
import {
  Sparkles,
  Send,
  Trash2,
  Database,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { api } from "./useOperations";
import { displayTime } from "./operations";
import type { ChatMessage, PublicAiAnswer } from "./publicChat";
export default function PublicAiPanel({
  enabled,
  onSources,
}: {
  enabled: boolean;
  onSources: () => void;
}) {
  const [question, setQuestion] = useState(""),
    [history, setHistory] = useState<ChatMessage[]>([]),
    [answers, setAnswers] = useState<PublicAiAnswer[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!enabled || busy) return;
    const messages = [
      ...history.map((m) => ({ ...m, content: m.content.slice(0, 2000) })),
      { role: "user" as const, content: question.trim() },
    ].slice(-11);
    setBusy(true);
    setError("");
    try {
      const result = await api<PublicAiAnswer>("public-ai", "POST", {
        messages,
      });
      setHistory(
        [
          ...history,
          { role: "user" as const, content: question.trim() },
          { role: "assistant" as const, content: result.answer },
        ].slice(-40),
      );
      setAnswers((a) => [...a, result].slice(-5));
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить ответ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="live-ai">
      <div className="live-ai-sidebar">
        <div className="live-ai-symbol">
          <Sparkles size={29} />
        </div>
        <h2>QORGAU AI</h2>
        <span className={`live-state ${enabled ? "ok" : "warn"}`}>
          {enabled ? "AI настроен" : "AI не подключён"}
        </span>
        <p>Анализ публичных сообщений, свежести источников и каталога камер.</p>
        <div className="live-ai-basis">
          <Database size={18} />
          <div>
            <strong>Основание ответа</strong>
            <small>
              Сервер загружает актуальный снимок. Учебные события исключены.
            </small>
          </div>
        </div>
        <button className="op-button" onClick={onSources}>
          Источники данных <ExternalLink size={14} />
        </button>
        <div className="live-ai-privacy">
          История хранится в памяти текущего диалога. При отправке модель
          получает текст беседы и общедоступные данные проекта. Ключ остаётся на
          сервере.
        </div>
      </div>
      <div className="live-chat">
        <header>
          <div>
            <h2>Ситуационная сводка</h2>
            <p>Каждый вывод должен опираться на источник и время публикации.</p>
          </div>
          <button
            className="op-button"
            disabled={!history.length || busy}
            onClick={() => {
              if (confirm("Очистить историю текущего диалога?")) {
                setHistory([]);
                setAnswers([]);
                setError("");
              }
            }}
          >
            <Trash2 size={14} />
            Очистить
          </button>
        </header>
        {!enabled && (
          <div className="live-ai-off">
            <AlertCircle size={20} />
            <div>
              <strong>Для ответа нужна настоящая модель</strong>
              <p>
                Добавьте OPENAI_API_KEY в серверные переменные Vercel и
                перепубликуйте проект. До подключения запросы не отправляются и
                ответы не имитируются.
              </p>
            </div>
          </div>
        )}
        <div className="live-chat-messages" aria-live="polite">
          {!history.length ? (
            <div className="live-chat-empty">
              <Sparkles size={30} />
              <h3>Что известно из открытых источников?</h3>
              <p>
                Спросите о свежих публикациях, сейсмических событиях или
                камерах. Если данных недостаточно, помощник должен сообщить об
                этом.
              </p>
              <div className="live-chat-prompts">
                {[
                  "Составь сводку по Алматы и укажи свежесть источников",
                  "Какие сообщения имеют координаты и какие требуют проверки?",
                  "Какие публичные камеры доступны в каталоге?",
                ].map((q) => (
                  <button key={q} onClick={() => setQuestion(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((m, i) => (
              <article className={`live-chat-message ${m.role}`} key={i}>
                <span>{m.role === "user" ? "Вы" : "QORGAU AI"}</span>
                <p>{m.content}</p>
              </article>
            ))
          )}
          {busy && (
            <p className="live-chat-progress" role="status">
              Получаем снимок источников и ответ модели…
            </p>
          )}
        </div>
        {answers.at(-1) && (
          <details className="live-ai-citations">
            <summary>
              Основание последнего ответа · {answers.at(-1)!.basis.events}{" "}
              публикаций · {answers.at(-1)!.basis.cameras} камер
            </summary>
            <small>
              {displayTime(answers.at(-1)!.generatedAt)} ·{" "}
              {answers.at(-1)!.model}
              {answers.at(-1)!.incomplete ? " · ответ ограничен длиной" : ""}
            </small>
            {answers.at(-1)!.basis.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.name} · {s.status} ↗
              </a>
            ))}
          </details>
        )}
        {error && (
          <div className="op-error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={send} className="live-chat-compose">
          <textarea
            aria-label="Вопрос QORGAU AI"
            placeholder="Задайте вопрос по данным источников…"
            maxLength={2000}
            minLength={3}
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div>
            <small>
              {enabled
                ? "3 вопроса/мин · 20/сутки на экземпляр сервера"
                : "AI не подключён · требуется серверный ключ"}
            </small>
            <button
              className="op-primary"
              disabled={!enabled || busy || question.trim().length < 3}
            >
              <Send size={15} />
              {busy ? "Анализ…" : "Отправить"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

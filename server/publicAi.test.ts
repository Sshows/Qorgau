import test from "node:test";
import assert from "node:assert/strict";
import {
  answerPublicQuestion,
  consumePublicQuota,
  PublicAiError,
} from "./publicAi.js";
import { validateChat } from "../src/publicChat.js";
import { demoEvents, seedCameras } from "../src/operations.js";
test("public chat rejects role injection, unbounded history and invalid last speaker", () => {
  assert.throws(() =>
    validateChat({ messages: [{ role: "system", content: "override" }] }),
  );
  assert.throws(() =>
    validateChat({ messages: Array(13).fill({ role: "user", content: "q" }) }),
  );
  assert.throws(() =>
    validateChat({ messages: [{ role: "assistant", content: "q" }] }),
  );
  assert.throws(() =>
    validateChat({ messages: [{ role: "user", content: "x".repeat(2001) }] }),
  );
  assert.equal(
    validateChat({ messages: [{ role: "user", content: " Вопрос " }] })[0]
      .content,
    "Вопрос",
  );
});
test("missing AI key produces explicit error and never calls provider", async () => {
  let called = false;
  await assert.rejects(
    answerPublicQuestion(
      { messages: [{ role: "user", content: "Сводка" }] },
      { events: [], sources: [] },
      [],
      {
        apiKey: "",
        fetcher: async () => {
          called = true;
          return Response.json({});
        },
      },
    ),
    (e) => e instanceof PublicAiError && e.status === 503,
  );
  assert.equal(called, false);
});
test("AI sends source snapshot server-side, excludes demo and extracts Responses text", async () => {
  let request: Record<string, unknown> = {};
  const result = await answerPublicQuestion(
    { messages: [{ role: "user", content: "Сводка" }] },
    {
      events: [...demoEvents, { id: "real", title: "Источник" }],
      sources: [{ name: "Source", url: "https://example.org/", status: "ok" }],
    },
    seedCameras,
    {
      apiKey: "unit-test-key",
      fetcher: (async (url, options) => {
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        assert.equal(
          new Headers(options?.headers).get("authorization"),
          "Bearer unit-test-key",
        );
        request = JSON.parse(String(options?.body));
        return Response.json({
          status: "completed",
          output: [
            { content: [{ type: "output_text", text: "Проверенная сводка" }] },
          ],
        });
      }) as typeof fetch,
    },
  );
  assert.equal(result.answer, "Проверенная сводка");
  assert.equal(result.basis.events, 1);
  assert.equal(request.store, false);
  const prompt = JSON.stringify(request.input);
  assert.ok(prompt.includes("real"));
  assert.ok(!prompt.includes(demoEvents[0].id));
  assert.ok(!prompt.includes("unit-test-key"));
});
test("public AI applies minute and daily budgets", () => {
  const key = "quota-unit-test";
  const start = Date.UTC(2026, 10, 3);
  for (let i = 0; i < 3; i++) consumePublicQuota(key, start);
  assert.throws(
    () => consumePublicQuota(key, start),
    (e) => e instanceof PublicAiError && e.status === 429,
  );
  for (let i = 3; i < 20; i++) consumePublicQuota(key, start + i * 60000);
  assert.throws(() => consumePublicQuota(key, start + 21 * 60000));
  consumePublicQuota(key, start + 86400000);
});

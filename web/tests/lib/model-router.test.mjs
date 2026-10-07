import test from "node:test";
import assert from "node:assert/strict";
import { providerSettings, routedJsonResponse, routingStatus } from "../../../personal-agent/model-router.mjs";

test("FreeLLMAPI is the default gateway for light and heavy tasks", () => {
  const settings = providerSettings({ OPENROUTER_API_KEY: "test", LITELLM_BASE_URL: "http://localhost:4000/v1", LITELLM_MODEL: "heavy" });
  assert.equal(settings.routes.light[0], "freellmapi");
  assert.equal(settings.routes.heavy[0], "freellmapi");
});
test("local mode removes cloud providers", () => {
  const settings = providerSettings({ AI_ROUTING_MODE: "local", OPENROUTER_API_KEY: "test" });
  assert.deepEqual(settings.routes.light, ["ollama"]);
  assert.deepEqual(settings.routes.heavy, ["ollama"]);
});

test("router falls back from Ollama to OpenRouter", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith("http://127.0.0.1")) throw new Error("offline");
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"ok"}' } }] }) };
  };
  const result = await routedJsonResponse({ OPENROUTER_API_KEY: "test" }, { task: "light", instructions: "x", messages: [] }, { fetchImpl });
  assert.equal(result.reply, "ok");
  assert.equal(calls.length, 2);
});

test("status treats keyless local Ollama as available", () => {
  const status = routingStatus({});
  assert.equal(status.available, true);
  assert.deepEqual(status.lightRoute[0], "ollama");
});

test("FreeLLMAPI uses its local OpenAI-compatible endpoint and unified key", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"reply":"free route"}' } }] }) };
  };
  const result = await routedJsonResponse(
    { FREELLMAPI_API_KEY: "freellmapi-test", OPENROUTER_API_KEY: "backup" },
    { task: "heavy", instructions: "Return JSON", messages: [] },
    { fetchImpl },
  );
  assert.equal(result.reply, "free route");
  assert.equal(calls[0].url, "http://127.0.0.1:3001/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer freellmapi-test");
  assert.equal(JSON.parse(calls[0].options.body).model, "auto");
});

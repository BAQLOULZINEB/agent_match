import test from "node:test";
import assert from "node:assert/strict";
import { providerSettings, routedJsonResponse, routingStatus } from "../../../personal-agent/model-router.mjs";

test("light tasks prefer local Ollama and heavy tasks prefer cloud", () => {
  const settings = providerSettings({ OPENROUTER_API_KEY: "test", LITELLM_BASE_URL: "http://localhost:4000/v1", LITELLM_MODEL: "heavy" });
  assert.equal(settings.routes.light[0], "ollama");
  assert.equal(settings.routes.heavy[0], "openrouter");
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

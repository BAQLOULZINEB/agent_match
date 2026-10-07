import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [installDir, dataRoot] = process.argv.slice(2);
if (!installDir || !dataRoot) throw new Error("Usage: configure-freellmapi.mjs <install-dir> <career-ops-data-root>");

const envPath = path.join(path.resolve(installDir), ".env");
const dbModule = path.join(path.resolve(installDir), "server", "dist", "db", "index.js");
if (!fs.existsSync(envPath) || !fs.existsSync(dbModule)) throw new Error("FreeLLMAPI is not configured and built.");

process.env.FREEAPI_ENV_PATH = envPath;
process.env.NODE_ENV = "production";
await import(pathToFileURL(path.join(path.resolve(installDir), "server", "dist", "env.js")));
const { connectDb, getUnifiedApiKey } = await import(pathToFileURL(dbModule));
connectDb();
const unifiedKey = getUnifiedApiKey();
if (!unifiedKey?.startsWith("freellmapi-")) throw new Error("FreeLLMAPI did not expose a valid unified key.");

const secretPath = path.join(path.resolve(dataRoot), "data", "personal-secrets.json");
fs.mkdirSync(path.dirname(secretPath), { recursive: true });
let saved = {};
if (fs.existsSync(secretPath)) saved = JSON.parse(fs.readFileSync(secretPath, "utf8"));
const prepend = (value, provider, fallback) => {
  const items = String(value || fallback).split(/[,;\s]+/).filter(Boolean).filter((item) => item !== provider);
  return [provider, ...items].join(",");
};
saved = {
  ...saved,
  AI_PROVIDER: saved.AI_PROVIDER || "auto",
  AI_ROUTING_MODE: saved.AI_ROUTING_MODE || "hybrid",
  AI_LIGHT_ROUTE: prepend(saved.AI_LIGHT_ROUTE, "freellmapi", "ollama,openrouter,gemini,groq,litellm,openai"),
  AI_HEAVY_ROUTE: prepend(saved.AI_HEAVY_ROUTE, "freellmapi", "openrouter,litellm,openai,gemini,groq,ollama"),
  FREELLMAPI_API_KEY: unifiedKey,
  FREELLMAPI_BASE_URL: "http://127.0.0.1:3001/v1",
  FREELLMAPI_MODEL: saved.FREELLMAPI_MODEL || "auto",
  FREELLMAPI_TIMEOUT_MS: saved.FREELLMAPI_TIMEOUT_MS || "130000",
};
const tempPath = `${secretPath}.${process.pid}.tmp`;
fs.writeFileSync(tempPath, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(tempPath, secretPath);
try { fs.chmodSync(secretPath, 0o600); } catch {}
console.log("FreeLLMAPI unified key saved to the ignored Career Ops secret store (value not displayed).");

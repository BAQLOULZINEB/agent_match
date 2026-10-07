const DEFAULT_ROUTES = {
  light: ["ollama", "openrouter", "gemini", "groq", "litellm", "openai"],
  heavy: ["openrouter", "litellm", "openai", "gemini", "groq", "ollama"],
};

const DEFAULT_MODELS = {
  ollama: "qwen2.5:14b",
  openrouter: "openrouter/free",
  litellm: "",
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
};

const PROVIDERS = new Set(Object.keys(DEFAULT_MODELS));

function split(value) {
  return String(value || "").split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
}

function route(value, fallback) {
  const items = split(value).map((item) => item.toLowerCase()).filter((item) => PROVIDERS.has(item));
  return items.length ? [...new Set(items)] : [...fallback];
}

function endpoint(base, suffix = "/chat/completions") {
  return `${String(base || "").replace(/\/+$/, "")}${suffix}`;
}

export function providerSettings(config = {}) {
  const selected = String(config.AI_PROVIDER || "auto").toLowerCase();
  const litellmKeys = split(config.LITELLM_API_KEYS || config.LITELLM_API_KEY || "");
  const providers = {
    ollama: {
      provider: "ollama",
      baseUrl: config.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
      model: config.OLLAMA_MODEL || DEFAULT_MODELS.ollama,
      keys: [""],
      configured: config.AI_DISABLE_OLLAMA !== "1",
      local: true,
    },
    openrouter: {
      provider: "openrouter",
      baseUrl: config.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      model: config.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter,
      keys: split(config.OPENROUTER_API_KEYS || config.OPENROUTER_API_KEY),
      configured: Boolean(config.OPENROUTER_API_KEYS || config.OPENROUTER_API_KEY),
      local: false,
    },
    litellm: {
      provider: "litellm",
      baseUrl: config.LITELLM_BASE_URL || "",
      model: config.LITELLM_MODEL || DEFAULT_MODELS.litellm,
      keys: litellmKeys.length ? litellmKeys : [""],
      configured: Boolean(config.LITELLM_BASE_URL && config.LITELLM_MODEL),
      local: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(config.LITELLM_BASE_URL || ""),
    },
    openai: {
      provider: "openai",
      baseUrl: config.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: config.OPENAI_MODEL || DEFAULT_MODELS.openai,
      keys: split(config.OPENAI_API_KEYS || config.OPENAI_API_KEY),
      configured: Boolean(config.OPENAI_API_KEYS || config.OPENAI_API_KEY),
      local: false,
    },
    gemini: {
      provider: "gemini",
      baseUrl: config.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
      model: config.GEMINI_MODEL || DEFAULT_MODELS.gemini,
      keys: split(config.GEMINI_API_KEYS || config.GEMINI_API_KEY),
      configured: Boolean(config.GEMINI_API_KEYS || config.GEMINI_API_KEY),
      local: false,
    },
    groq: {
      provider: "groq",
      baseUrl: config.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      model: config.GROQ_MODEL || DEFAULT_MODELS.groq,
      keys: split(config.GROQ_API_KEYS || config.GROQ_API_KEY),
      configured: Boolean(config.GROQ_API_KEYS || config.GROQ_API_KEY),
      local: false,
    },
  };

  let light = route(config.AI_LIGHT_ROUTE, DEFAULT_ROUTES.light);
  let heavy = route(config.AI_HEAVY_ROUTE, DEFAULT_ROUTES.heavy);
  if (selected !== "auto" && PROVIDERS.has(selected)) {
    light = [selected, ...light.filter((item) => item !== selected)];
    heavy = [selected, ...heavy.filter((item) => item !== selected)];
  }
  if (config.AI_ROUTING_MODE === "local") {
    light = light.filter((item) => providers[item].local);
    heavy = heavy.filter((item) => providers[item].local);
  } else if (config.AI_ROUTING_MODE === "cloud") {
    light = light.filter((item) => !providers[item].local);
    heavy = heavy.filter((item) => !providers[item].local);
  }
  return { selected, providers, routes: { light, heavy } };
}

export function routingStatus(config = {}) {
  const settings = providerSettings(config);
  const configured = Object.values(settings.providers).filter((provider) => provider.configured).map((provider) => provider.provider);
  return {
    provider: settings.selected,
    model: "routed by task",
    configured,
    available: configured.length > 0,
    lightRoute: settings.routes.light.filter((name) => settings.providers[name].configured),
    heavyRoute: settings.routes.heavy.filter((name) => settings.providers[name].configured),
  };
}

function parseJson(content) {
  const text = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(text); } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Réponse IA non JSON.");
  }
}

async function requestProvider(provider, { instructions, messages, fetchImpl, timeoutMs }) {
  let lastError;
  for (const key of provider.keys.length ? provider.keys : [""]) {
    const headers = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    const body = {
      model: provider.model,
      messages: [{ role: "system", content: instructions }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 5000,
    };
    if (provider.provider === "openrouter") body.provider = { data_collection: "deny" };
    try {
      const response = await fetchImpl(endpoint(provider.baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`${provider.provider} HTTP ${response.status}`);
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      return parseJson(content);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${provider.provider} indisponible`);
}

export async function routedJsonResponse(config, request, options = {}) {
  const task = request.task === "heavy" ? "heavy" : "light";
  const settings = providerSettings(config);
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(config.AI_TIMEOUT_MS) || 45_000;
  const attempted = [];
  for (const name of settings.routes[task]) {
    const provider = settings.providers[name];
    if (!provider?.configured) continue;
    attempted.push(name);
    try {
      return await requestProvider(provider, { ...request, fetchImpl, timeoutMs });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.onFallback) options.onFallback({ provider: name, message });
    }
  }
  if (!attempted.length) throw new Error("Aucun moteur IA disponible. Lancez Ollama ou configurez une clé cloud dans Connexions.");
  throw new Error(`Tous les moteurs IA ont échoué (${attempted.join(" → ")}). Vérifiez Ollama, les quotas et les modèles.`);
}

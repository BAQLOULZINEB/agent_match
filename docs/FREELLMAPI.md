# FreeLLMAPI integration

Career Ops uses a locally running [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) gateway as its first AI route. The gateway is OpenAI-compatible, so Career Studio still sends a normal `POST /v1/chat/completions` request with `model: "auto"`. FreeLLMAPI chooses a usable upstream, applies its own health/rate-limit/fallback logic, and returns an OpenAI-shaped response.

## What changed

Before this integration, Career Ops selected Ollama or a directly configured OpenRouter, Gemini, Groq, LiteLLM, or OpenAI endpoint. Ollama is not installed on this machine, and each remote provider required Career Ops to hold and rotate its key itself.

Now the default light and heavy routes start with `freellmapi`. The local gateway currently has anonymous entries for Kilo, OVH AI Endpoints, and AI Horde. If the gateway is unavailable or all of those routes fail, Career Ops continues through any direct fallback credentials already configured. Strict `AI_ROUTING_MODE=local` still excludes FreeLLMAPI because the gateway is local but its selected inference provider is remote.

Free means no API charge for the configured anonymous routes, not unlimited service. They have provider-controlled quotas, variable latency, and no availability guarantee. Kilo states that anonymous prompts/outputs may be logged for training. Do not send sensitive CV content until you accept the selected upstream's privacy terms. For private offline inference, install Ollama and use `AI_ROUTING_MODE=local`.

## Start and stop

The pinned FreeLLMAPI checkout is expected beside this repository:

```text
outputs/
├─ career-ops/
└─ freellmapi/       # v0.13.6
```

Start everything:

```powershell
.\personal-agent\Start-Platform.ps1
```

This creates a private FreeLLMAPI `.env`, an ignored declarative configuration, starts the gateway on `127.0.0.1:3001`, copies its generated unified API key into the ignored Career Ops secret store, then starts the Career Ops dashboard and scheduler.

Manage only the gateway:

```powershell
.\personal-agent\Start-FreeLLMAPI.ps1
.\personal-agent\Stop-FreeLLMAPI.ps1
```

Use a non-default checkout:

```powershell
.\personal-agent\Start-FreeLLMAPI.ps1 -InstallPath 'D:\tools\freellmapi'
```

Stop the whole platform:

```powershell
.\personal-agent\Stop-Platform.ps1
```

## Verify

The launcher does not display the unified key. It records logs under ignored `data/personal-runtime/` and writes configuration to ignored `data/personal-secrets.json`.

```powershell
Invoke-WebRequest http://127.0.0.1:3001/livez -UseBasicParsing
npm --prefix web test
```

In Career Studio, open **Connexions**. The route status should include `freellmapi`. A real assistant message should produce a response; if every anonymous provider is busy, the UI reports the exhausted chain rather than silently submitting or applying to a job.

## Troubleshooting

- **Port 3001 occupied:** stop the other process or change both the FreeLLMAPI `PORT` and Career Ops `FREELLMAPI_BASE_URL`. The launcher refuses to kill unknown processes.
- **Gateway starts but `/readyz` is unavailable:** `/livez` proves the process is running; readiness also requires a usable upstream. Inspect `data/personal-runtime/freellmapi.err.log`.
- **429 or 5xx:** anonymous services are rate-limited. FreeLLMAPI tries another model/provider; Career Ops then tries its direct configured fallbacks.
- **Very slow response:** AI Horde is volunteer-backed and may queue for minutes. Career Ops gives this gateway 130 seconds.
- **Need better reliability:** add a free-tier Google/Groq/OpenRouter key in the FreeLLMAPI dashboard at `http://127.0.0.1:3001/`, or configure it directly in Career Ops as a fallback.
- **Need fully local/private inference:** install Ollama, pull a model, and select strict local mode. FreeLLMAPI's anonymous providers are remote.

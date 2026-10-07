# Tool inventory

Recorded 2026-10-07 for the Career Ops FreeLLMAPI integration.

| Tool | Version / identity | Scope | Installation / verification | Purpose |
| --- | --- | --- | --- | --- |
| Node.js | `v22.20.0` | Existing user installation | `node --version` | Runs Career Ops and FreeLLMAPI |
| npm | `10.9.3` | Existing user installation | `npm --version` | Reproducible dependency install and builds |
| Git | `2.48.1.windows.1` | Existing user installation | `git --version` | Pinned source checkout |
| FreeLLMAPI | tag `v0.13.6`, commit `ffef850fe8553b03f89e2f76be4cb4da2b709378` | Project-adjacent checkout, not global | `git clone --branch v0.13.6 --depth 1 ...`; `npm ci --ignore-scripts --no-audit --no-fund`; `npm rebuild better-sqlite3`; `npm run build` | Local OpenAI-compatible free-provider router |
| Docker | Not installed | N/A | `docker --version` failed | Source installation selected instead of containers |
| Ollama | Not installed | N/A | `ollama --version` failed | Optional fully local fallback remains available but inactive |

Install location: `C:\Users\zineb\Documents\Codex\2026-09-30\bu\outputs\freellmapi`.

No administrator privileges, global npm packages, Docker daemon, or paid FreeLLMAPI catalog subscription were used. The generated `.env`, encrypted SQLite database, unified API key, provider configuration, logs, CV/profile data, and Career Ops secrets remain local and ignored by Git.

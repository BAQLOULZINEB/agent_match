# Personal career agent

A local career workspace built on [career-ops](https://github.com/career-ops-hq/career-ops), with a conversational assistant, France Travail search, reviewable profile edits, application drafts and a visible action journal. The inspected upstream base reports version **1.34.0**. Preserve upstream attribution and the repository's MIT license.

**Delivery status:** source implementation and targeted tests are present. Final production build, fresh-clone delivery, launch verification and remote push status are pending the release owner's verification. See [HANDOFF.md](HANDOFF.md) for known release checks and the next work.

## What it does

- Collects offers from France Travail after a developer application is configured; imports other offers manually from their real source URLs.
- Applies explainable role, contract, age, country and priority filters. Unknown publication dates, liveness and eligibility stay visible for review.
- Offers French and English chat. Supported browsers can dictate a message and read the response aloud. Dictation is started explicitly, and the transcript can be reviewed before sending.
- Proposes changes to the approved CV, profile or search settings. The user sees the proposed text and confirms or rejects it. Approved changes retain a version journal; stale proposals cannot overwrite a newer document.
- Prepares a targeted CV and letter from supplied candidate facts, then requires a saved draft and explicit review before recording a manually sent application.
- Optionally reads limited Google Calendar, Gmail and Drive data after OAuth consent. Export creates the exact reviewed text in the connected Drive account only after confirmation.
- Runs periodic local searches through a persisted scheduler; provides an optional inactive n8n workflow.

The workflow roles shown in the UI describe executed stages: collection, filtering, drafting and human decisions. They do not represent independently running autonomous models.

## Start locally

Use Node.js **22.6 or newer**, which satisfies the web package's requirement. From the repository root:

```powershell
npm install
npm --prefix web ci
npm --prefix web run build
.\personal-agent\Start-Platform.ps1
```

The root package's installation can install Playwright Chromium. Both root and web dependencies are required. Before distributing a clone, include the France Travail connector at the path imported by `service.mjs`; its local plugin directory is ignored by default.

The launcher opens `http://127.0.0.1:3000/personal`, starts hidden Node processes, and refuses to replace an unrelated process on port 3000. To stop:

```powershell
.\personal-agent\Stop-Platform.ps1
```

See [README-local.md](README-local.md) for process records, logs, restart behavior and troubleshooting. **The PC must remain powered on, awake and online.** Local searches do not run when the PC is off. Closing the browser leaves the worker running; restarting Windows requires starting it again. No login task or cloud service is installed.

## Connect services

Enter credentials through **Connexions**, or provide the supported variables in the server process environment. Saved keys are kept in the private user data directory; environment values take precedence. Never put keys in committed code, workflow exports, screenshots or handoff documents.

| Service | Configuration | Current behavior |
| --- | --- | --- |
| OpenRouter | `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` | Uses OpenRouter chat completions; the code defaults to `openrouter/free` and requests providers that deny data collection. Availability, limits and cost depend on the selected service/model. |
| OpenAI | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, optional `OPENAI_MODEL` | Uses the Responses API; the inspected code defaults to `gpt-4.1-mini` with `store:false`. |
| France Travail | `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET`, optional `FRANCE_TRAVAIL_SCOPE` | Requires an application subscribed to Offres d'emploi. Default scope in the connector: `api_offresdemploiv2 o2dsoffre`. Confirm the granted scope during the first live connection check. |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Requires a configured OAuth application and enabled APIs for selected services; the user grants each requested scope. |

AI requests send the approved profile/CV and selected conversation/job context to the chosen provider. Browser dictation may use the browser vendor's speech service. Local hosting alone does not mean all processing happens on the PC.

For Google, register the **exact** callback URI used by the browser. The code default is `http://localhost:3000/personal/google-callback`; if working at `127.0.0.1`, set and register `http://127.0.0.1:3000/personal/google-callback` instead. Do not mix hosts when a browser session is required. The implemented scopes are:

- Calendar: `calendar.events.readonly`.
- Gmail: `gmail.readonly`; the current UI reads selected message metadata, not sending capabilities.
- Drive: `drive.file`; listing is limited by this scope rather than unrestricted access to all Drive content.

Account setup, consent and authenticated service behavior require a live test. Configuration presence in the UI is not proof that credentials work.

## Scheduling and n8n

Enable the built-in schedule through a confirmed search-settings change. The worker checks settings every 30 seconds, retains the last attempt across restarts and starts one overdue scan. Missing credentials hold execution; failed attempts wait for the configured interval.

Alternatively, read [n8n/README.md](n8n/README.md) and import [n8n/workflow.json](n8n/workflow.json). It is delivered inactive without credentials, for native n8n on the same PC. Its cadence is independent of the built-in schedule; choose one scheduler. The automation token is a separate private server variable, `PERSONAL_AUTOMATION_TOKEN`, configured as a Header Auth credential in n8n. The loopback bearer boundary has synthetic coverage; live n8n execution still requires importing and configuring the workflow.

## Data and review boundaries

Read [the data contract](../DATA_CONTRACT.md) and [repository instructions](../AGENTS.md) before editing. The core resolver selects the private data directory through `CAREER_OPS_ROOT` / `CAREER_OPS_DATA_DIR`, `.career-ops-data`, or the repository default.

Canonical profile and tracker files remain `cv.md`, `config/profile.yml`, `data/pipeline.md` and `data/applications.md`. The personal agent's JSON stores proposals, review stages, conversations and execution history. Secrets, tokens, documents, versions and runtime records belong to private user data. They must not enter a public repository.

The pipeline and tracker are written through existing core functions/scripts. Profile changes need explicit approval. A newly edited draft needs another review. Marking an application sent records the user's declaration; it sends nothing.

## Limits

- No automatic application submission, email sending or social publishing.
- No live Moroccan job API is implemented; Moroccan offers currently use manual import from verified sources.
- No guarantee of ATS acceptance or hiring outcomes. Tailoring must preserve factual evidence.
- A returned France Travail record does not establish browser-verified liveness or international eligibility.
- Speech input depends on browser support and permission; this is not an always-listening voice service.
- The local launcher does not publish the site or provide access while the PC is off. Remote session primitives are present, but a production internet deployment has not been verified.
- The reviewed document endpoint returns plain text. A complete designed PDF/DOCX export from this new workspace is future work.

## Verify

From the repository root:

```powershell
node --test plugins.local/france-travail/test/smoke.mjs web/tests/lib/personal-agent.test.mjs web/tests/lib/personal-auth.test.mjs web/tests/lib/personal-integration.test.mjs
npm --prefix web run typecheck
npm --prefix web run build
```

The first command passed **29 tests** in the documentation review on 2026-10-01. The full web suite passed **797 tests** with 12 intentional skips and zero failures; TypeScript and the production build also passed. Tests use synthetic candidates and offers; no account credentials are needed. For engineering details and remaining acceptance checks, continue with [HANDOFF.md](HANDOFF.md).

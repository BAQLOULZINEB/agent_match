# Zineb AI Career Studio

Local-first personal career assistant for Zineb Baqloul: voice conversation, opportunity discovery, CV/profile tailoring with approval, and an auditable application workflow.

## What it does

- Searches public ATS boards without credentials, prioritising Tours, Lille, Rabat and Salé.
- Supports France Travail and Google integrations when the user adds credentials privately.
- Keeps the original CV template unchanged and proposes tailored edits for review before saving.
- Supports browser voice input and spoken replies when the browser provides speech APIs.
- Stores personal profile, CV, reports and credentials locally; private files are ignored by Git.
- Works with a local n8n instance through the documented adapter points.

## Run locally

```powershell
./personal-agent/Start-Platform.ps1
```

Then open `http://127.0.0.1:3000/personal`. Use `./personal-agent/Stop-Platform.ps1` to stop it.

Run local validation before pushing:

```powershell
npm test
npm --prefix web run typecheck
npm --prefix web run build
npm audit --audit-level=high
```

See [`docs/LOCAL-CI.md`](docs/LOCAL-CI.md) for the free local validation workflow and [`personal-agent/HANDOFF.md`](personal-agent/HANDOFF.md) for implementation status and privacy boundaries.

## Privacy

Personal CVs, profile data, job history, reports, OAuth tokens and API keys stay in ignored local files. Do not commit them. The public repository contains source code and safe configuration only.

# Start the local career agent

The dashboard and scheduler run on this Windows PC. The dashboard listens only on `127.0.0.1:3000`; it is not published online and cannot be reached from another device. Local hosting has no hosting subscription fee. Any connected AI provider can still charge for API usage.

## First start

Prerequisites: Node.js 22.6 or newer, root and web dependencies installed, and a successful production build (`npm run build` in `web/`). Start from PowerShell:

```powershell
.\personal-agent\Start-Platform.ps1
```

This opens `http://127.0.0.1:3000/personal` and starts two hidden native Node processes: Next.js and the scheduler. `-NoBrowser` starts the same processes without opening the page. It reuses its recorded live processes and refuses to replace an unrelated process on port 3000.

In **Connexions**, enter credentials for your France Travail developer application subscribed to Offres d'emploi. Enable the schedule in the search settings, choose the interval, and confirm the proposed change. Without credentials the worker records a connection-needed status and performs no scan. Without an enabled schedule it performs no scan. Morocco remains a separately imported source; the France Travail connector does not search Morocco.

## Availability and saved progress

**The PC must remain powered on, awake and connected to the internet. Nothing runs while it is switched off or asleep.** Closing the browser does not stop the two processes. Signing out or restarting Windows stops them. Run Start-Platform.ps1 again afterwards. This launcher does not install a Windows login task or cloud service.

The scheduler checks the saved settings every 30 seconds. On restart, it runs one scan if due; it does not replay every missed interval. A failed attempt waits for the configured interval before another automatic attempt. Connecting previously missing credentials allows the next due scan. Manual searches continue to work independently; the service's scan lock prevents concurrent collectors.

The persisted `worker` object includes PID, start time, heartbeat, status and next run. While a scan is active it refreshes the heartbeat every 30 seconds. A heartbeat is evidence of the last recorded activity; an old heartbeat does not prove the process is still running. `scheduler` retains the last attempt and outcome. A core cross-process lock permits only one scheduler for each data directory and reclaims a dead worker's lock on restart.

Settings, profile, offers and history stay in the resolved career-ops data directory. Resolution uses the existing core resolver (CAREER_OPS_ROOT / CAREER_OPS_DATA_DIR, `.career-ops-data`, then repository root). Keep these private user files backed up locally.

## Stop

```powershell
.\personal-agent\Stop-Platform.ps1
```

The stop script checks the executable, script path, creation time and PID before stopping either process. It requests a graceful worker stop, then waits up to five seconds before stopping a busy worker. A scan interrupted at that point may be incomplete; atomic writes and persisted history are retained. On the next launch the stale process lock is recovered. No offers or documents are deleted.

## Troubleshooting

Runtime records and logs live in `<data root>/data/personal-runtime/`: `platform.json`, `web.out.log`, `web.err.log`, `worker.out.log`, and `worker.err.log`. These are private ignored runtime data. The launcher requires a completed `web/.next/BUILD_ID`; it does not build automatically. If port 3000 is occupied by another session, stop that session first. If identity checks fail, inspect the actual process instead of deleting a PID file and stopping arbitrary processes.

For a one-shot scheduler check using the same saved settings:

```powershell
node personal-agent/scheduler.mjs --once
```

This command can perform a real search when the saved schedule is enabled and due. A `worker.stop` marker left by Stop-Platform.ps1 prevents worker execution until the launcher clears it.

## Verification performed

Synthetic checks passed for disabled scheduling, due calculation after restart, absent credentials without repeated events, successful scans, failure cadence, sanitized errors, and rejection of a second worker. Both PowerShell scripts passed the PowerShell parser. A full launcher/stop integration run requires the production build and must be verified separately. Live API success requires valid France Travail credentials.

## Local validation and AI key rotation

Run the former CI checks on this PC without GitHub Actions:

```powershell
.\personal-agent\Validate-Local.ps1 -Build
```

In **Connexions**, enter multiple private OpenRouter or OpenAI keys, one per line. If a provider rejects a key or its quota is exhausted, the assistant tries the next key automatically. Keys remain in ignored local settings and are never pushed.

import { spawn } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { careerOpsRoot, rootScript } from '@/lib/career-ops';
import { isLoopbackHost } from '@/lib/origin-guard.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// This bearer token grants exactly one operation: collect job offers. It never
// becomes a browser session or reaches the child process through user input.
export async function POST(req: Request) {
  const forwarded = req.headers.get('x-forwarded-host');
  if (!isLoopbackHost(req.headers.get('host')) || !isLoopbackHost(new URL(req.url).host)
      || (forwarded && !isLoopbackHost(forwarded))) {
    return reply({ error: 'Local automation endpoint only.' }, 403);
  }
  const secret = process.env.PERSONAL_AUTOMATION_TOKEN;
  if (!secret || secret.length < 32 || secret.length > 256 || /\s/.test(secret)) {
    return reply({ error: 'Automation authentication is not configured.' }, 503);
  }
  const token = /^Bearer ([^\s]{32,256})$/i.exec(req.headers.get('authorization') || '')?.[1];
  if (!token || !timingSafeEqual(createHash('sha256').update(token).digest(), createHash('sha256').update(secret).digest())) {
    return reply({ error: 'Automation authentication failed.' }, 401);
  }
  // Request body and query parameters are deliberately ignored: callers cannot
  // select another bridge action, supply profile content, or mark an application.
  return new Promise<Response>(resolve => {
    const root = careerOpsRoot();
    const child = spawn(process.execPath, [rootScript('personal-agent/bridge')], {
      cwd: root,
      env: { ...process.env, CAREER_OPS_ROOT: root },
      windowsHide: true,
    });
    let output = '', settled = false;
    const finish = (response: Response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(reply({ error: 'Scan timed out. Check the local activity log before retrying.' }, 504));
    }, 170000);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 1000000) {
        child.kill();
        finish(reply({ error: 'Scan result unavailable. Check the local activity log.' }, 502));
      }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => finish(reply({ error: 'Scan engine unavailable.' }, 503)));
    child.on('close', code => {
      try {
        const data = JSON.parse(output);
        if (code !== 0 || data.ok !== true) {
          finish(reply({ error: 'Scan failed. Check the local activity log.' }, 502));
          return;
        }
        const added = data.result?.added, duplicates = data.result?.duplicates;
        if (!Number.isInteger(added) || added < 0 || !Number.isInteger(duplicates) || duplicates < 0) {
          finish(reply({ error: 'Scan result unavailable.' }, 502));
          return;
        }
        finish(reply({ ok: true, added, duplicates }));
      } catch {
        finish(reply({ error: 'Scan result unavailable. Check the local activity log.' }, 502));
      }
    });
    child.stdin.end(JSON.stringify({ action: 'scan' }));
  });
}

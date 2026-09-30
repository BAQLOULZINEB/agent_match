import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRequest,
  parseAllowedHosts,
  parseAllowedOrigins,
  isLoopbackHost,
} from "@/lib/origin-guard.mjs";
import { verifySession } from '@/lib/personal-auth.mjs';

// Single choke point over the API surface. Every /api request is gated on the
// same-origin + loopback guard before it can reach a route handler (which may
// spawn a child process or write the user's files). See origin-guard.mjs for
// the two-layer rationale (F1 drive-by CSRF, F2 LAN reachability).
//
// Opt in to extra hosts (e.g. a trusted LAN box) with a comma/space separated
// CAREER_OPS_WEB_ALLOWED_HOSTS; unset means loopback only.
//
// Opt in to extra *origins* the same way with CAREER_OPS_ALLOWED_ORIGINS;
// unset means none, which is the default and leaves the guard as strict as it
// was. It is what a local companion client needs: a browser extension calls
// from a chrome-extension:// origin, which Fetch Metadata always reports as
// "cross-site", so every one of its requests is refused otherwise.
export async function proxy(req: NextRequest) {
  const pathname=req.nextUrl.pathname;
  const remote=process.env.PERSONAL_REQUIRE_AUTH==='true'||!isLoopbackHost(req.headers.get('host'));
  const password=process.env.PERSONAL_APP_PASSWORD;
  const secret=process.env.PERSONAL_SESSION_SECRET;
  if(remote && (!password || password.length<16 || !secret || secret.length<32)) {
    return NextResponse.json({error:'Remote access requires a password (16+ characters) and session secret (32+ characters).'},{status:503});
  }
  if((remote||password) && pathname!=='/login' && pathname!=='/api/personal/login' && !await verifySession(req.cookies.get('personal_session')?.value,secret)) {
    if(pathname.startsWith('/api/'))return NextResponse.json({error:'Sign in to your private platform.'},{status:401});
    return NextResponse.redirect(new URL('/login',req.url));
  }
  // OAuth returns through a page and exchanges its one-time code by a same-origin
  // POST, so no cross-site exception is needed for any API endpoint.
  if(!pathname.startsWith('/api/'))return NextResponse.next();
  const decision = checkRequest({
    secFetchSite: req.headers.get("sec-fetch-site"),
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
    allowedHosts: parseAllowedHosts(process.env.CAREER_OPS_WEB_ALLOWED_HOSTS),
    allowedOrigins: parseAllowedOrigins(process.env.CAREER_OPS_ALLOWED_ORIGINS),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };

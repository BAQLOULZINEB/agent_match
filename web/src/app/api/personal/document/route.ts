import fs from 'node:fs';
import path from 'node:path';
import {careerOpsRoot} from '@/lib/career-ops';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Download only the exact current reviewed version; no arbitrary file reads.
export async function GET(req:Request) {
  const version=new URL(req.url).searchParams.get('version')||'';
  if(!/^[0-9a-f-]{36}$/.test(version))return Response.json({error:'Invalid document.'},{status:400});
  try {
    const state=JSON.parse(fs.readFileSync(path.join(careerOpsRoot(),'data','personal-agent.json'),'utf8'));
    const offer=state.offers.find((o:{stage:string;draft?:{version:string}})=>o.draft?.version===version&&['REVIEWED','MANUALLY_APPLIED','INTERVIEW'].includes(o.stage));
    if(!offer)return Response.json({error:'Review the current document first.'},{status:409});
    return new Response(offer.draft.content,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="application-reviewed.txt"','Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Document unavailable.'},{status:404});}
}

import {spawn} from 'node:child_process';
import {careerOpsRoot,rootScript} from '@/lib/career-ops';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=180;
function run(body:unknown):Promise<Response> {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[rootScript('personal-agent/bridge')],{cwd:careerOpsRoot(),env:{...process.env,CAREER_OPS_ROOT:careerOpsRoot()},windowsHide:true});
    let out='',settled=false;
    const finish=(r:Response)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(r);};
    const timer=setTimeout(()=>{child.kill();finish(Response.json({error:'Action timed out; consult the workflow before retrying.'},{status:504}));},170000);
    child.stdout.on('data',(d:Buffer)=>{out+=d.toString();if(out.length>4000000){child.kill();finish(Response.json({error:'Response too large.'},{status:500}));}});
    child.stderr.resume();
    child.on('error',()=>finish(Response.json({error:'Cannot start the career-ops engine.'},{status:500})));
    child.on('close',()=>{try{const data=JSON.parse(out);finish(Response.json(data.ok?data.result:{error:data.error},{status:data.ok?200:400,headers:{'Cache-Control':'no-store'}}));}catch{finish(Response.json({error:'Engine response unavailable.'},{status:500}));}});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(body));
  });
}
export async function GET(){return run({action:'state'});}
export async function POST(req:Request){
  if(!req.headers.get('content-type')?.includes('application/json'))return Response.json({error:'JSON required.'},{status:415});
  const text=await req.text();if(text.length>200000)return Response.json({error:'Request too large.'},{status:413});
  try{return run(JSON.parse(text));}catch{return Response.json({error:'Invalid JSON.'},{status:400});}
}

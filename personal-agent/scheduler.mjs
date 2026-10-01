import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {getCareerOpsRoot} from '../path-resolver.mjs';
import {withPipelineLock} from '../pipeline-lock.mjs';
import {state, transaction, event} from './store.mjs';
import {validateSearch} from './domain.mjs';
import {connectionStatus} from './connectors.mjs';
import {scan,scanPublic} from './service.mjs';

const stamp = value => {const ms=Date.parse(value||'');return Number.isFinite(ms)?ms:0;};
/** Pure due calculation: the saved interval applies to attempts, including errors. */
export function scheduleStatus(s, now=Date.now()) {
  const search=validateSearch(s.search);
  if(!search.scheduleEnabled)return {status:'disabled',due:false,nextRunAt:null};
  const last=Math.max(stamp(s.scheduler?.lastAttemptAt),stamp(s.lastScan?.finished),stamp(s.lastSuccessfulScan));
  const next=last ? last+search.scanEveryHours*3600000 : now;
  return {status:next<=now?'due':'waiting',due:next<=now,nextRunAt:new Date(next).toISOString()};
}
async function heartbeat(root, status, extras={}) {
  return transaction(root,s=>{
    s.worker={...s.worker,pid:process.pid,heartbeatAt:new Date().toISOString(),status,...extras};
  });
}
/** One tick, separately callable for deterministic local tests. */
export async function tick(root, {now=Date.now(),scanFn,connections=connectionStatus}={}) {
  const s=state(root),plan=scheduleStatus(s,now);
  if(!plan.due){await heartbeat(root,plan.status,{nextRunAt:plan.nextRunAt});return plan;}
  const collector=scanFn || (connections(root).franceTravail ? scan : scanPublic);
  // Re-read inside transaction so a disabled schedule cannot be used from an old snapshot.
  const claimed=await transaction(root,v=>{
    if(!scheduleStatus(v,now).due)return false;
    v.scheduler={...v.scheduler,lastAttemptAt:new Date(now).toISOString(),lastOutcome:'running'};
    v.worker={...v.worker,pid:process.pid,heartbeatAt:new Date().toISOString(),status:'scanning',nextRunAt:null};
    event(v,'Planification','Recherche programmée','Le collecteur lance une recherche publique ATS ; France Travail est utilisé automatiquement lorsqu’il est configuré.','running');return true;
  });
  if(!claimed)return {status:'settings_changed',due:false,nextRunAt:null};
  let pulseBusy=false;
  const pulse=setInterval(async()=>{
    if(pulseBusy)return;pulseBusy=true;
    try{await heartbeat(root,'scanning');}catch{console.error('Worker heartbeat could not be saved.');}finally{pulseBusy=false;}
  },30000);
  try {
    await collector(root);
    await transaction(root,v=>{v.scheduler.lastOutcome='success';v.scheduler.lastFinishedAt=new Date().toISOString();});
    const next=scheduleStatus(state(root));await heartbeat(root,'waiting',{nextRunAt:next.nextRunAt});
    return {status:'success',due:false,nextRunAt:next.nextRunAt};
  } catch {
    // The service writes the detailed, sanitized error. Never echo unknown exceptions or secrets here.
    await transaction(root,v=>{v.scheduler.lastOutcome='error';v.scheduler.lastFinishedAt=new Date().toISOString();event(v,'Planification','Recherche programmée interrompue','Consultez le journal de collecte. La prochaine tentative respecte l’intervalle configuré.','error');});
    const next=scheduleStatus(state(root));await heartbeat(root,'error',{nextRunAt:next.nextRunAt});
    return {status:'error',due:false,nextRunAt:next.nextRunAt};
  } finally {clearInterval(pulse);}
}
export async function runWorker(root=getCareerOpsRoot(),{once=false}={}) {
  const runtime=path.join(root,'data','personal-runtime');fs.mkdirSync(runtime,{recursive:true});
  const stopFile=path.join(runtime,'worker.stop');
  return withPipelineLock(path.join(root,'data','personal-worker'),async()=>{
    let stopping=false;
    const stop=()=>{stopping=true;};process.on('SIGINT',stop);process.on('SIGTERM',stop);
    await transaction(root,s=>{s.worker={pid:process.pid,startedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString(),status:'starting',nextRunAt:null};event(s,'Planification','Agent local démarré','Les recherches suivent les paramètres confirmés. Le PC doit rester allumé.');});
    try {
      do {
        if(stopping||fs.existsSync(stopFile))break;
        await tick(root);
        if(once)break;
        for(let n=0;n<30&&!stopping&&!fs.existsSync(stopFile);n++)await delay(1000);
      }while(!stopping);
    } finally {
      process.off('SIGINT',stop);process.off('SIGTERM',stop);
      await heartbeat(root,'stopped',{nextRunAt:null,stoppedAt:new Date().toISOString()});
    }
  },{timeoutMs:1000,maxWaitMs:1000});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runWorker(getCareerOpsRoot(),{once:process.argv.includes('--once')}).catch(error=>{
    console.error(error?.name==='LockTimeoutError'?'A scheduler already owns the worker lock.':'Scheduler stopped. Check the local state file and collection journal.');process.exitCode=1;
  });
}

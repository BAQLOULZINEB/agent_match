import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withPipelineLock} from '../pipeline-lock.mjs';
import {writeFileAtomic} from '../tracker-utils.mjs';
import * as yaml from 'js-yaml';
import {defaults,validateSearch,cleanText} from './domain.mjs';

export function readText(file, fallback='') { try { return fs.readFileSync(file,'utf8'); } catch(e) { if(e.code==='ENOENT') return fallback; throw e; } }
export function readJSON(file, fallback) { const t=readText(file); return t ? JSON.parse(t) : structuredClone(fallback); }
export function write(file,value) { fs.mkdirSync(path.dirname(file),{recursive:true}); writeFileAtomic(file,typeof value==='string'?value:JSON.stringify(value,null,2)); }
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const stateFile=root=>path.join(root,'data','personal-agent.json');
export function state(root) { return readJSON(stateFile(root),{version:1,search:defaults,offers:[],proposals:[],events:[],conversations:[],lastScan:null}); }
export async function transaction(root,fn) {
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  return withPipelineLock(stateFile(root), async()=>{const s=state(root); const result=await fn(s); write(stateFile(root),s); return result;});
}
export function event(s,role,action,detail,status='done') {
  s.events.unshift({id:randomUUID(),at:new Date().toISOString(),role,action,detail:cleanText(detail,3000),status});
  s.events=s.events.slice(0,1000);
}
const fileFor=(root,target)=>path.join(root,target==='profile'?'config/profile.yml':'cv.md');
export function current(root,s,target) { return target==='search'?s.search:readText(fileFor(root,target)); }
export async function propose(root,{target,value,summary,source='user'}) {
  if(!['profile','cv','search'].includes(target)) throw Error('Unsupported editable document.');
  if(target==='search') value=validateSearch(value);
  else {
    if(typeof value!=='string'||value.length>60000||!value.trim()) throw Error('Document must contain 1–60000 characters.');
    if(target==='profile') { const p=yaml.load(value); if(!p||typeof p!=='object'||Array.isArray(p)) throw Error('Profile must be a YAML mapping.'); }
  }
  return transaction(root,s=>{
    const before=current(root,s,target);
    const p={id:randomUUID(),target,before,after:value,baseHash:hash(before),summary:cleanText(summary,400)||'Modification proposée',source,createdAt:new Date().toISOString(),status:'pending'};
    s.proposals.unshift(p); event(s,'Rédaction','Changement proposé',p.summary,'review'); return p;
  });
}
export async function decide(root,id,accept) {
  return transaction(root,s=>{
    const p=s.proposals.find(x=>x.id===id); if(!p||p.status!=='pending') throw Error('Proposal not found or already resolved.');
    if(accept) {
      if(hash(current(root,s,p.target))!==p.baseHash) throw Error('Document changed since this proposal. Request a fresh preview.');
      // Write-ahead history survives a process exit between file and state writes.
      write(path.join(root,'data','personal-versions',p.id+'.json'),{...p,approvedAt:new Date().toISOString()});
      if(p.target==='search') s.search=validateSearch(p.after); else write(fileFor(root,p.target),p.after);
    }
    p.status=accept?'approved':'rejected'; p.resolvedAt=new Date().toISOString();
    event(s,'Vous',accept?'Changement confirmé':'Changement refusé',p.summary); return p;
  });
}
export function recoverableProposals(root) {
  const s=state(root);
  // A written file with a matching approved journal is a completed operation,
  // never silently overwrite it again after a crash.
  return s.proposals.map(p=>p.status==='pending' && fs.existsSync(path.join(root,'data','personal-versions',p.id+'.json')) && hash(current(root,s,p.target))===hash(p.after) ? {...p,status:'approved'}:p);
}

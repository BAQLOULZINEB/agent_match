import {getCareerOpsRoot} from '../path-resolver.mjs';
import {handle} from './service.mjs';
let input='';
for await(const chunk of process.stdin) {input+=chunk;if(input.length>200000)throw Error('Request too large.');}
try { const result=await handle(getCareerOpsRoot(),JSON.parse(input));process.stdout.write(JSON.stringify({ok:true,result:result??null})); }
catch(e) {process.stdout.write(JSON.stringify({ok:false,error:e.message||'Action failed.'}));process.exitCode=1;}

import path from 'node:path';
import fs from 'node:fs';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readJSON,write,transaction,event} from './store.mjs';
import {cleanText} from './domain.mjs';

const privateFile=root=>path.join(root,'data','personal-secrets.json');
const allowedKeys=['AI_PROVIDER','OPENROUTER_API_KEY','OPENROUTER_MODEL','OPENAI_API_KEY','OPENAI_MODEL','FRANCE_TRAVAIL_CLIENT_ID','FRANCE_TRAVAIL_CLIENT_SECRET','FRANCE_TRAVAIL_SCOPE','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI'];
export function credentials(root) {
  const saved=readJSON(privateFile(root),{});
  for(const key of allowedKeys) if(process.env[key]) saved[key]=process.env[key];
  return saved;
}
export async function saveCredentials(root,values) {
  await transaction(root,s=>{
    const data=readJSON(privateFile(root),{});
    for(const [key,value] of Object.entries(values||{})) {
      if(!allowedKeys.includes(key)||typeof value!=='string'||value.length>5000||/[\r\n\0]/.test(value)) throw Error('Invalid connection setting.');
      if(key==='AI_PROVIDER'&&!['openrouter','openai'].includes(value))throw Error('Unknown AI provider.');
      if(value.trim()) data[key]=value.trim();
    }
    write(privateFile(root),data); try{fs.chmodSync(privateFile(root),0o600);}catch{}
    event(s,'Connexions','Configuration enregistrée','Les valeurs privées restent sur le serveur.');
  });
}
export function connectionStatus(root) {
  const c=credentials(root),g=readJSON(path.join(root,'data','google-token.json'),{});
  const ai=aiSettings(c);
  return {ai:!!ai.key,provider:ai.provider,model:ai.model,franceTravail:!!(c.FRANCE_TRAVAIL_CLIENT_ID&&c.FRANCE_TRAVAIL_CLIENT_SECRET),googleConfigured:!!(c.GOOGLE_CLIENT_ID&&c.GOOGLE_CLIENT_SECRET),googleConnected:!!g.refresh_token,googleScopes:g.scope||'',redirectUri:c.GOOGLE_REDIRECT_URI||'http://localhost:3000/personal/google-callback',morocco:'manual-import',hosting:'local'};
}
export function aiSettings(c) {
  const provider=c.AI_PROVIDER||(c.OPENROUTER_API_KEY?'openrouter':'openai');
  return provider==='openrouter'?{provider,key:c.OPENROUTER_API_KEY,model:c.OPENROUTER_MODEL||'openrouter/free'}:{provider:'openai',key:c.OPENAI_API_KEY,model:c.OPENAI_MODEL||'gpt-4.1-mini'};
}
export async function aiResponse(c,{instructions,messages}) {
  const a=aiSettings(c);
  if(!a.key)throw Error('Configurez la clé du fournisseur IA dans Connexions.');
  const headers={Authorization:`Bearer ${a.key}`,'Content-Type':'application/json'};
  if(a.provider==='openrouter') {
    const result=await jsonRequest('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers,body:JSON.stringify({model:a.model,messages:[{role:'system',content:instructions},...messages],response_format:{type:'json_object'},max_tokens:5000,provider:{data_collection:'deny'}})});
    if(result.error)throw Error('Le fournisseur IA a refusé la demande. Vérifiez le modèle et le quota.');
    return JSON.parse(result.choices?.[0]?.message?.content||'{}');
  }
  const result=await jsonRequest('https://api.openai.com/v1/responses',{method:'POST',headers,body:JSON.stringify({model:a.model,store:false,instructions,input:messages,text:{format:{type:'json_object'}},max_output_tokens:5000})});
  return JSON.parse((result.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join(''));
}
export async function jsonRequest(url,options={}) {
  const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw Error(`Service distant indisponible (${r.status}). Vérifiez les droits et identifiants dans Connexions.`);
  return r.json();
}
export const GOOGLE_SCOPES={calendar:'https://www.googleapis.com/auth/calendar.events.readonly',gmail:'https://www.googleapis.com/auth/gmail.readonly',drive:'https://www.googleapis.com/auth/drive.file'};
export async function googleStart(root,app) {
  if(!GOOGLE_SCOPES[app]) throw Error('Choose Calendar, Gmail or Drive.');
  const c=credentials(root); if(!c.GOOGLE_CLIENT_ID||!c.GOOGLE_CLIENT_SECRET) throw Error('Configurez votre application OAuth Google dans Connexions.');
  const redirectUri=c.GOOGLE_REDIRECT_URI||'http://localhost:3000/personal/google-callback';
  const u=new URL(redirectUri); if(u.protocol!=='https:' && !['localhost','127.0.0.1'].includes(u.hostname)) throw Error('Google redirect must use HTTPS or localhost.');
  const nonce=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
  await transaction(root,s=>{write(path.join(root,'data','google-oauth.json'),{nonce,verifier,redirectUri,createdAt:Date.now()});event(s,'Connexions','Autorisation Google demandée',app,'review');});
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [k,v]of Object.entries({client_id:c.GOOGLE_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:GOOGLE_SCOPES[app],access_type:'offline',prompt:'consent',include_granted_scopes:'true',state:nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})) url.searchParams.set(k,v);
  return {url:url.href};
}
export async function googleFinish(root,{code,state:nonce}) {
  return transaction(root,async s=>{
    const p=readJSON(path.join(root,'data','google-oauth.json'),{});
    const a=Buffer.from(String(nonce||'')),b=Buffer.from(String(p.nonce||''));
    if(!p.nonce||a.length!==b.length||!timingSafeEqual(a,b)||Date.now()-p.createdAt>600000) throw Error('Autorisation expirée. Reconnectez Google.');
    // Consume once before network exchange; failed exchanges require a new consent.
    write(path.join(root,'data','google-oauth.json'),{});
    const c=credentials(root);
    const token=await jsonRequest('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:cleanText(code,4096),client_id:c.GOOGLE_CLIENT_ID,client_secret:c.GOOGLE_CLIENT_SECRET,redirect_uri:p.redirectUri,grant_type:'authorization_code',code_verifier:p.verifier})});
    const previous=readJSON(path.join(root,'data','google-token.json'),{});
    if(!token.refresh_token&&!previous.refresh_token) throw Error('Google n’a pas fourni de connexion durable. Réessayez avec le consentement.');
    write(path.join(root,'data','google-token.json'),{...previous,...token,expiresAt:Date.now()+(token.expires_in||3600)*1000});
    event(s,'Connexions','Google connecté',token.scope||'Droits autorisés'); return {connected:true};
  });
}
async function googleToken(root,app) {
  const c=credentials(root),t=readJSON(path.join(root,'data','google-token.json'),{});
  if(!t.refresh_token) throw Error('Connectez Google dans Connexions.');
  if(!String(t.scope||'').includes(GOOGLE_SCOPES[app])) throw Error(`Autorisez Google ${app} dans Connexions.`);
  const token=await jsonRequest('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.GOOGLE_CLIENT_ID,client_secret:c.GOOGLE_CLIENT_SECRET,refresh_token:t.refresh_token,grant_type:'refresh_token'})});
  return token.access_token;
}
export async function googleRead(root,app) {
  const token=await googleToken(root,app); const headers={Authorization:`Bearer ${token}`};
  let items=[];
  if(app==='calendar') {
    const u=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events'); u.searchParams.set('timeMin',new Date().toISOString());u.searchParams.set('maxResults','20');u.searchParams.set('singleEvents','true');u.searchParams.set('orderBy','startTime');
    const r=await jsonRequest(u.href,{headers});items=(r.items||[]).map(x=>({title:x.summary||'Événement',date:x.start?.dateTime||x.start?.date,url:x.htmlLink}));
  } else if(app==='gmail') {
    const u=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');u.searchParams.set('q','newer_than:14d (stage OR alternance OR internship OR entretien OR interview)');u.searchParams.set('maxResults','10');
    const r=await jsonRequest(u.href,{headers});
    for(const m of r.messages||[]) {
      const d=await jsonRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,{headers});
      const hs=d.payload?.headers||[];items.push({title:hs.find(h=>h.name.toLowerCase()==='subject')?.value||'(sans objet)',from:hs.find(h=>h.name.toLowerCase()==='from')?.value||'',url:`https://mail.google.com/mail/u/0/#all/${m.id}`});
    }
  } else if(app==='drive') {
    const r=await jsonRequest('https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,webViewLink)&q=trashed%3Dfalse',{headers}); items=(r.files||[]).map(f=>({title:f.name,url:f.webViewLink||`https://drive.google.com/file/d/${f.id}/view`}));
  } else throw Error('Unknown Google app.');
  await transaction(root,s=>event(s,'Google',`Lecture ${app}`,`${items.length} éléments. Aucun message envoyé.`));
  return {app,items};
}
export async function googleDisconnect(root) {
  const t=readJSON(path.join(root,'data','google-token.json'),{});
  if(t.refresh_token) {
    const r=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:t.refresh_token}),signal:AbortSignal.timeout(15000)});
    if(!r.ok&&r.status!==400) throw Error('Google n’a pas confirmé la révocation. Réessayez.');
  }
  await transaction(root,s=>{write(path.join(root,'data','google-token.json'),{});event(s,'Vous','Google déconnecté','Autorisation révoquée.');}); return {disconnected:true};
}
export async function uploadReviewedDocument(root,{name,content}) {
  const token=await googleToken(root,'drive'),boundary='career_'+randomBytes(12).toString('hex');
  const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,mimeType:'application/vnd.google-apps.document'})}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  return jsonRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body});
}

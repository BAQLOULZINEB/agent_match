import {issueSession,passwordMatches} from '@/lib/personal-auth.mjs';
import {isLoopbackHost} from '@/lib/origin-guard.mjs';
export const runtime='nodejs';
let attempts:number[]=[];
export async function POST(req:Request) {
  const now=Date.now();attempts=attempts.filter(t=>now-t<60000);
  if(attempts.length>=8)return Response.json({error:'Trop de tentatives. Réessayez dans une minute.'},{status:429});
  attempts.push(now);
  let body;try{body=await req.json();}catch{return Response.json({error:'Requête invalide.'},{status:400});}
  if(!await passwordMatches(body.password,process.env.PERSONAL_APP_PASSWORD))return Response.json({error:'Mot de passe incorrect.'},{status:401});
  try{
    const token=await issueSession(process.env.PERSONAL_SESSION_SECRET);
    return Response.json({ok:true},{headers:{'Set-Cookie':`personal_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${isLoopbackHost(req.headers.get('host'))?'':'; Secure'}`,'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Configurez le secret de session sur le serveur.'},{status:503});}
}
export async function DELETE(){return Response.json({ok:true},{headers:{'Set-Cookie':'personal_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'}});}

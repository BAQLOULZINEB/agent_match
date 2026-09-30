const encode=bytes=>Buffer.from(bytes).toString('base64url');
async function sign(text,secret) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return encode(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)));
}
export async function issueSession(secret,now=Date.now()) {
  if(!secret||secret.length<32)throw Error('Session secret must have at least 32 characters.');
  const payload=encode(JSON.stringify({exp:now+12*3600000,nonce:crypto.randomUUID()}));
  return payload+'.'+await sign(payload,secret);
}
export async function verifySession(token,secret,now=Date.now()) {
  if(!secret||secret.length<32||!token)return false;
  try {
    const [payload,signature,...rest]=token.split('.');if(rest.length)return false;
    const expected=await sign(payload,secret);if(signature?.length!==expected.length)return false;
    let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^signature.charCodeAt(i);
    const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return !mismatch&&Number.isFinite(data.exp)&&data.exp>now&&data.exp<=now+12*3600000;
  }catch{return false;}
}
export async function passwordMatches(value,expected) {
  if(!expected||expected.length<16||typeof value!=='string')return false;
  const digest=async t=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t)));
  const a=await digest(value),b=await digest(expected);let result=0;for(let i=0;i<a.length;i++)result|=a[i]^b[i];return result===0;
}

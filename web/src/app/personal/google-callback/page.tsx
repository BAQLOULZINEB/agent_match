'use client';
import {useEffect,useRef,useState} from 'react';
export default function GoogleCallback(){
 const started=useRef(false);const [message,setMessage]=useState('Vérification de votre autorisation Google…');
 useEffect(()=>{if(started.current)return;started.current=true;const p=new URLSearchParams(location.search);const code=p.get('code'),state=p.get('state');history.replaceState(null,'','/personal/google-callback');if(!code||!state){setMessage('Autorisation annulée. Vous pouvez revenir aux connexions.');return;}fetch('/api/personal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'google-finish',code,state})}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setMessage('Google est connecté. Retournez à votre espace.');}).catch(e=>setMessage(e.message));},[]);
 return <main className="p-10"><h1 className="text-2xl mb-5">Connexion Google</h1><p role="status">{message}</p><a className="inline-block mt-5 underline" href="/personal">Revenir à Career Studio</a></main>;
}

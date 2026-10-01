import test from 'node:test';
import assert from 'node:assert/strict';
import plugin, { searchFranceTravail } from '../index.mjs';
const settings = {clientId:'synthetic-id', clientSecret:'synthetic-secret', queries:['data']};
const response = (body,status=200,headers={}) => new Response(status===204||status===416?null:JSON.stringify(body),{status,headers});
const row = id => ({id:String(id),intitule:'AI Engineer',typeContrat:'CDD',natureContrat:'Contrat apprentissage',dateCreation:'2026-01-01T12:00:00Z'});
function mock(responses) {
  const calls=[];
  const fn=async(url,options)=>{calls.push({url,options});const next=responses.shift(); if(next instanceof Error)throw next; assert.ok(next,'unexpected extra request');return next;};
  return {fn,calls};
}
test('OAuth credentials only go to token host; contracts and safe URLs normalized',async()=>{
  const m=mock([response({access_token:'fake-token'}),response({resultats:[{...row(1),contact:{urlPostulation:'javascript:alert(1)'},origineOffre:{urlOrigine:'https://user:pass@example.com/job'}}]})]);
  const result=await searchFranceTravail(settings,m.fn);
  assert.equal(new URL(m.calls[0].url).hostname,'entreprise.francetravail.fr');
  assert.equal(new URL(m.calls[0].url).searchParams.get('realm'),'/partenaire');
  assert.equal(m.calls[0].options.body.get('scope'),'api_offresdemploiv2 o2dsoffre');
  assert.equal(m.calls[0].options.body.get('client_secret'),'synthetic-secret');
  assert.equal(m.calls[1].options.headers.Authorization,'Bearer fake-token');
  assert.equal(m.calls[1].options.body,undefined);
  assert.match(result.offers[0].contract,/apprentissage/);
  assert.match(result.offers[0].url,/candidat.francetravail.fr/);
  assert.equal(result.offers[0].applicationUrl,result.offers[0].url);
  assert.equal(result.offers[0].liveStatus,'unknown');
  assert.equal(result.offers[0].eligibility,'UNKNOWN');
});
test('pagination deduplicates and honors exact Content-Range completion',async()=>{
  const rows=Array.from({length:100},(_,i)=>row(i));
  const m=mock([response({access_token:'fake'}),response({resultats:rows},206,{'content-range':'offres 0-99/200'}),response({resultats:rows},206,{'content-range':'offres 100-199/200'})]);
  const r=await searchFranceTravail(settings,m.fn);
  assert.equal(m.calls.length,3);assert.equal(r.offers.length,100);assert.equal(r.partial,false);
  assert.equal(new URL(m.calls[2].url).searchParams.get('range'),'100-199');
});
test('three-page bound reports partial and query limit reports partial',async()=>{
  const rows=Array.from({length:100},(_,i)=>row(i));
  const m=mock([response({access_token:'fake'}),...Array.from({length:3},()=>response({resultats:rows},206))]);
  assert.equal((await searchFranceTravail(settings,m.fn)).partial,true);assert.equal(m.calls.length,4);
  const n=mock([response({access_token:'fake'}),...Array.from({length:5},()=>response(null,204))]);
  assert.equal((await searchFranceTravail({...settings,queries:['a','b','c','d','e','f']},n.fn)).partial,true);
});
test('429 retries bounded, long retry-after exits instead of early retry',async()=>{
  const m=mock([response({},429,{'retry-after':'0'}),response({access_token:'fake'}),response({},429,{'retry-after':'0'}),response({resultats:[]})]);
  assert.deepEqual(await searchFranceTravail(settings,m.fn),{offers:[],partial:false});
  const n=mock([response({},429,{'retry-after':'60'})]);
  await assert.rejects(searchFranceTravail(settings,n.fn),/limite/);assert.equal(n.calls.length,1);
});
test('errors never expose upstream secrets; malformed payload fails closed',async()=>{
  for(const responses of [[new Error('synthetic-secret')],[response({error:'synthetic-secret'},401)],[new Response('synthetic-secret')],[response({access_token:'fake'}),response({resultats:{bad:true}})]]){
    const m=mock(responses);await assert.rejects(searchFranceTravail(settings,m.fn),error=>!error.message.includes('synthetic-secret'));
  }
  await assert.rejects(searchFranceTravail({},()=>{throw Error('must not fetch')}),/Client ID/);
});
test('plugin uses guarded fetch; no credentials acquired from global env',async()=>{
  const m=mock([response({access_token:'fake'}),response({resultats:[row(1)]})]);
  const offers=await plugin.provider.fetch({queries:['AI engineer']},{env:{FRANCE_TRAVAIL_CLIENT_ID:'test',FRANCE_TRAVAIL_CLIENT_SECRET:'test'},settings:{},fetch:m.fn});
  assert.equal(offers.length,1);assert.equal(new URL(m.calls[1].url).searchParams.get('motsCles'),'AI engineer');
});

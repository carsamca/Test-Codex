import assert from 'node:assert/strict';
import { Server } from 'node:net';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dist = process.env.VOICE_AUDIT_DIST ? pathToFileURL(path.resolve(process.env.VOICE_AUDIT_DIST)+'/') : new URL('../dist/',import.meta.url);
const source = name => new URL(name,dist).href;
const fixed = process.argv.includes('--fixed');
delete process.env.OPENAI_API_KEY; delete process.env.FORCE_LANGUAGE;
const temp = await mkdtemp(path.join(tmpdir(), 'voice-audit-')); process.chdir(temp);
const { getSession } = await import(source('voice/sessionStore.js'));
const { detectLanguage } = await import(source('voice/language.js'));
const { handleChatTurn } = await import(source('voice/llm.js'));
const { synthesizeSpeech } = await import(source('voice/tts.js'));
const realFetch = globalThis.fetch; let providerCalls = []; let mock;
globalThis.fetch = async (url, init) => {
 if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, init);
 providerCalls.push({url, body: JSON.parse(init.body)});
 if (!mock) throw Error('External network prohibited by audit');
 return mock(url, init);
};
const originalListen = Server.prototype.listen; let server;
Server.prototype.listen = function(...args) { server = this; return originalListen.call(this, 0, '127.0.0.1', args.at(-1)); };
const originalLog = console.log; console.log = (...args) => console.error(...args);
await import(source('server.js'));
if (!server.listening) await new Promise(r => server.once('listening', r));
Server.prototype.listen = originalListen; console.log = originalLog;
const base = `http://127.0.0.1:${server.address().port}`;
const results = {}; let checks = 0;
function check(value, expected) { assert.deepEqual(value, expected); checks++; }
async function post(endpoint, body) { const r = await fetch(base + '/api/' + endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}); return {status:r.status, body:await r.json()}; }
try {
 for (const [lang,text] of Object.entries({es:'hola',en:'hello',fr:'bonjour',pt:'obrigado'})) {
  const stt=await post('stt',{text:'  '+text+'  '}); check(stt.body.text,text); check(stt.body.language,lang);
  const chat=await post('chat',{sessionId:lang,text,language:lang}); check(chat.status,200); check(chat.body.language,lang); check(chat.body.actions,[]);
  const tts=await post('tts',{text,language:lang}); check(tts.body.provider,'stub'); check(tts.body.audioBase64,null);
  const s=getSession(lang); check(s.transcript.length,2); check(s.language,lang); assert(s.transcript.every(x=>Number.isFinite(Date.parse(x.timestamp)))); checks++;
  process.env.FORCE_LANGUAGE=lang; check(detectLanguage('hello','en'),lang); delete process.env.FORCE_LANGUAGE;
 }
 check(getSession('unknown').transcript,[]);
 results.languages = Object.fromEntries(['Olá','orçamento','você','I have a budget','merci beaucoup'].map(x=>[x,detectLanguage(x)]));
 results.localeHints = Object.fromEntries(['es-ES','en-US','fr-FR','pt-BR'].map(x=>[x,detectLanguage('test',x)]));
 await post('stt',{sessionId:'flow',text:'hola'}); await post('chat',{sessionId:'flow',text:'hola'});
 results.flowTranscript=getSession('flow').transcript;
 if(fixed) { check(results.languages, {'Olá':'pt','orçamento':'pt','você':'pt','I have a budget':'en','merci beaucoup':'fr'}); check(results.localeHints,{'es-ES':'es','en-US':'en','fr-FR':'fr','pt-BR':'pt'}); }
 if(fixed) check(results.flowTranscript.map(x=>x.role),['user','assistant']);
 results.audioSTT=await post('stt',{audioBase64:'UklGRg=='});
 results.emptySTT=await post('stt',{});
 if(fixed) {check(results.audioSTT.status,501); check(results.emptySTT.status,400);}
 results.validation={missingChat:await post('chat',{}),numericText:await post('chat',{sessionId:'bad',text:123}),blankChat:await post('chat',{sessionId:'blank',text:'  '}),missingTTS:await post('tts',{})};
 if(fixed) {check(results.validation.numericText.status,400);check(results.validation.blankChat.status,400);}
 check(results.validation.missingChat.status,400); check(results.validation.missingTTS.status,400);
 process.env.OPENAI_API_KEY='audit-dummy-not-a-credential';
 mock=()=>Response.json({output:[{type:'message',content:[{type:'output_text',text:'Mock reply'}]}]});
 const context=getSession('en'); await handleChatTurn({session:context,userText:'hello',language:'en'});
 results.llmInput=providerCalls.at(-1).body.input;
 if(fixed) check(results.llmInput.filter(x=>x.role==='user'&&x.content==='hello').length,1);
 for(const [name,args] of Object.entries({guardarLead:{name:'Synthetic Test',contact:'test@example.invalid'},agendarCita:{name:'Synthetic Test',contact:'test@example.invalid',timezone:'UTC'},transferirHumano:{reason:'Synthetic test'},buscarFAQ:{query:'pricing',language:'es'}})) {
  mock=()=>Response.json({output:[{type:'function_call',name,call_id:'synthetic-call',arguments:JSON.stringify(args)}]});
  try {results[name]=await handleChatTurn({session:context,userText:'test',language:'es'});} catch(e) {results[name]={error:e.message};}
  if(fixed) check(results[name].actions.length,1);
 }
 results.toolFiles={};
 for(const file of await readdir(path.join(temp,'data'))) results.toolFiles[file]=(await readFile(path.join(temp,'data',file),'utf8')).trim().split('\n').map(JSON.parse);
 if(fixed) check(typeof results.toolFiles['leads.jsonl'][0].payload,'object');
 mock=()=>Response.json({error:{message:'synthetic failure'}},{status:500});
 const before=providerCalls.length;
 try {results.providerError=await handleChatTurn({session:context,userText:'test',language:'es'});} catch(e) {results.providerError={error:e.message};}
 if(fixed) check(results.providerError,{error:'LLM error: 500'});
 results.retryAttempts=providerCalls.length-before; check(results.retryAttempts,3);
 mock=()=>new Response(new Uint8Array([1,2,3]));
 results.mockTTS=await synthesizeSpeech({text:'synthetic',language:'fr'}); check(results.mockTTS.audioBase64,'AQID');
 if (fixed) {
 // Simulated timeouts: accelerate only the 10s abort timer; retain retry delays.
 const realSetTimeout = globalThis.setTimeout;
 let aborted = 0;
 globalThis.setTimeout = (fn, ms, ...args) => realSetTimeout(fn, ms === 10000 ? 1 : ms, ...args);
 mock = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => {aborted++; reject(new Error('Synthetic abort'));}));
 try { await handleChatTurn({session:context,userText:'timeout',language:'en'}); } catch(e) {results.timeoutError=e.message;}
 finally {globalThis.setTimeout=realSetTimeout;}
 check(aborted,3); results.timeoutAborts=aborted;
 const pending=[];
 mock = () => new Promise(resolve => pending.push(resolve));
 const first=post('chat',{sessionId:'race',text:'first'});
 while(pending.length<1) await new Promise(r=>realSetTimeout(r,1));
 const second=await post('chat',{sessionId:'race',text:'second'});
 check(second.status,409); results.concurrentRejected=second;
 pending[0](Response.json({output:[{type:'message',content:[{type:'output_text',text:'first reply'}]}]})); await first;
 check(getSession('race').transcript.length,2);
 mock=()=>Response.json({output:[{type:'message',content:[{type:'output_text',text:'second reply'}]}]});
 check((await post('chat',{sessionId:'race',text:'second'})).status,200);
 check(getSession('race').transcript.length,4);
 results.concurrentSession=getSession('race').transcript;
 for (const args of ['not-json', '{}', '{"name":42,"contact":"test@example.invalid"}']) {
  mock=()=>Response.json({output:[{type:'function_call',name:'guardarLead',arguments:args}]});
  await assert.rejects(handleChatTurn({session:context,userText:'test',language:'en'})); checks++;
 }
 results.ttsRequest=providerCalls.find(x=>x.url.endsWith('/audio/speech')).body;
 }
 delete process.env.OPENAI_API_KEY;
 let limited=0; for(let i=0;i<125;i++) {const r=await fetch(base+'/health'); if(r.status===429) limited++;}
 assert(limited>0); checks++; results.rateLimitedRequests=limited;
 results.checks=checks; results.mode=fixed?'corrected':'baseline';
 console.log(JSON.stringify(results,null,2));
} finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); await rm(temp,{recursive:true,force:true}); }

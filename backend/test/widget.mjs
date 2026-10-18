import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const baseline=process.argv.includes('--baseline');
const html=await readFile(root+'frontend/index.html','utf8');
const code=baseline?execFileSync('git',['show','3b150b8c00041537d176278d6b3c004265753946:frontend/app.js'],{cwd:root,encoding:'utf8'}):await readFile(root+'frontend/app.js','utf8');
const dom=new JSDOM(html,{url:'http://localhost:4173',runScripts:'outside-only'});
const w=dom.window;const requests=[];const spoken=[];
Object.defineProperty(w.navigator,'language',{value:'pt-BR'});
w.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
w.speechSynthesis={speak:u=>spoken.push({text:u.text,lang:u.lang})};
w.SpeechRecognition=class {start(){w.recognitionLocale=this.lang;this.onresult({results:[[{transcript:'obrigado'}]]});} stop(){}};
w.fetch=async(url,opts)=>{
 assert(url.startsWith('http://localhost:3001/api/'));const input=JSON.parse(opts.body);requests.push({path:new URL(url).pathname,input});
 const body=url.endsWith('/stt')?{text:input.text,language:'pt'}:url.endsWith('/tts')?{audioBase64:null,provider:'stub'}:{reply:'Resposta simulada',language:'pt',actions:[]};
 return {ok:true,json:async()=>body};
};
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
try {
 w.eval(code);const el=id=>w.document.getElementById(id);
 el('voice-widget-toggle').click();assert(el('voice-widget').classList.contains('active'));
 el('voice-text').value='<img src=x onerror="window.injected=true">';el('voice-send').click();await settle();
 assert.equal(spoken.length,1);
 el('voice-start').click();await settle();assert.equal(spoken.length,2);
 const state={recognitionLocale:w.recognitionLocale,spoken,images:el('voice-transcript').querySelectorAll('img').length};
 assert.equal(requests.filter(x=>x.path==='/api/stt').length,1);assert(!requests.some(x=>x.input.audioBase64));
 assert.equal(state.images,baseline?1:0);
 el('voice-widget-close').click();assert(!el('voice-widget').classList.contains('active'));
 console.log(JSON.stringify({mode:baseline?'baseline':'corrected',requests,state,limitation:'DOM emulado con jsdom; APIs de voz y respuestas HTTP simuladas. No se probó micrófono, sonido, compatibilidad ni renderizado en navegador real.'},null,2));
}finally {w.close();}

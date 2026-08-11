import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const which = command => spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding:'utf8' }).stdout.trim().split(/\r?\n/)[0];
const browserPath = [process.env.CHROME_BIN, which('chromium'), which('chromium-browser'), which('google-chrome'), which('google-chrome-stable')].filter(Boolean)[0];
if (!browserPath) throw new Error('Chrome/Chromium not found');

const paths = ['visualizer/app.html','visualizer/shell.html','visualizer/scene.html','visualizer/controls.html','visualizer/inspector.html'];
const tags = ['visualizer-app','visualizer-shell','visualizer-scene','visualizer-controls','visualizer-inspector'];
const fixtures = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(join(root,'examples',path),'utf8')])));
const runtime = await readFile(join(root,'skein.min.js'),'utf8');

const port = await new Promise((resolvePort,reject) => {
  const server=createServer(); server.on('error',reject); server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolvePort(port))});
});
const profile = await mkdtemp(join(tmpdir(),'skein-webgl-'));
const browser = spawn(browserPath,[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'
],{stdio:'ignore'});
const endpoint=`http://127.0.0.1:${port}`;

async function target(){for(let i=0;i<100;i++){try{const tabs=await fetch(`${endpoint}/json`).then(r=>r.json());const page=tabs.find(item=>item.type==='page');if(page)return page}catch{}await sleep(50)}throw new Error('Chrome DevTools Protocol did not become ready')}
const page=await target();
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveSocket,reject)=>{socket.onopen=resolveSocket;socket.onerror=reject});
let requestId=0; const pending=new Map(); const exceptions=[];
socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);return}if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)};
const send=(method,params={})=>new Promise((resolveRequest,reject)=>{const id=++requestId;pending.set(id,{resolve:resolveRequest,reject});socket.send(JSON.stringify({id,method,params}))});
await send('Runtime.enable'); await send('Page.enable');
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value};

try {
  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id;
  await send('Page.setDocumentContent',{frameId,html:'<!doctype html><html><head><base href="http://example.test/examples/"></head><body><visualizer-app></visualizer-app></body></html>'});
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`);
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`);

  let ready=false;
  for(let i=0;i<240;i++){await sleep(25);ready=await evaluate(`!!document.querySelector('visualizer-app')?.shadowRoot?.querySelector('visualizer-shell')?.shadowRoot?.querySelector('slot[name="scene"]')`);if(ready)break}
  if(!ready) throw new Error(`Visualizer did not mount: ${exceptions.join('\n')}`);

  const defined=await evaluate(`(${JSON.stringify(tags)}).filter(tag=>customElements.get(tag)).length`);
  if(defined!==tags.length) throw new Error(`Expected ${tags.length} component types, got ${defined}`);

  let state={};
  for(let i=0;i<160;i++){
    await sleep(25);
    state=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),shell=app.shadowRoot.querySelector('visualizer-shell'),root=shell.shadowRoot,scene=app.shadowRoot.querySelector('visualizer-scene');return{slots:['mast','scene','controls','inspector'].map(name=>root.querySelector('slot[name="'+name+'"]').assignedElements()[0]?.getAttribute('slot')||root.querySelector('slot[name="'+name+'"]').assignedElements()[0]?.localName),labels:scene.shadowRoot.querySelectorAll('.labels button').length,properties:scene.shadowRoot.querySelectorAll('.properties button').length,status:scene.state.status,webgl:!!scene.shadowRoot.querySelector('canvas').getContext('webgl2'),energy:scene.style.getPropertyValue('--energy'),count:scene.state.count}})()`);
    if(state.status==='WebGL2 live') break;
  }
  if(state.labels!==8||state.properties!==4||!state.webgl||state.status!=='WebGL2 live'||!state.energy||state.count<41) throw new Error(`WebGL field failed: ${JSON.stringify(state)}`);

  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('button[data-action="run"]').click()`);
  await sleep(30);
  let interaction=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{app:app.state.running,scene:scene.running}})()`);
  if(interaction.app!==false||interaction.scene!==false) throw new Error(`Composed run event/property flow failed: ${JSON.stringify(interaction)}`);

  await evaluate(`(()=>{const controls=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls'),range=controls.shadowRoot.querySelector('input');range.value='1.5';range.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await sleep(30);
  interaction=await evaluate(`(()=>{const app=document.querySelector('visualizer-app');return{app:app.state.speed,scene:app.shadowRoot.querySelector('visualizer-scene').speed,inspector:app.shadowRoot.querySelector('visualizer-inspector').speed}})()`);
  if(interaction.app!==1.5||interaction.scene!==1.5||interaction.inspector!==1.5) throw new Error(`Speed property flow failed: ${JSON.stringify(interaction)}`);

  const beforeBurst=await evaluate(`document.querySelector('visualizer-app').state.burst`);
  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('button[data-action="write"]').click()`);
  await sleep(30);
  interaction=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{burst:app.state.burst,sceneBurst:scene.burst,selected:app.state.selected}})()`);
  if(interaction.burst!==beforeBurst+1||interaction.sceneBurst!==interaction.burst||interaction.selected!==5) throw new Error(`Write event/property flow failed: ${JSON.stringify(interaction)}`);

  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-scene').shadowRoot.querySelector('.labels button[data-index="3"]').click()`);
  await sleep(30);
  interaction=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene'),inspector=app.shadowRoot.querySelector('visualizer-inspector');return{selected:app.state.selected,scene:scene.selected,step:inspector.step.id,accent:scene.shadowRoot.querySelector('.labels button[data-index="3"]').style.getPropertyValue('--accent')}})()`);
  if(interaction.selected!==3||interaction.scene!==3||interaction.step!==4||!interaction.accent) throw new Error(`Stage selection flow failed: ${JSON.stringify(interaction)}`);

  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-scene').shadowRoot.querySelector('.properties button[data-index="2"]').click()`);
  await sleep(30);
  interaction=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{selected:app.state.selected,source:scene.state.source,accent:scene.shadowRoot.querySelector('.properties button[data-index="2"]').style.getPropertyValue('--accent')}})()`);
  if(interaction.selected!==5||interaction.source!==2||!interaction.accent) throw new Error(`Property-node write failed: ${JSON.stringify(interaction)}`);

  if(exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`);
  console.log('visualizer-webgl: passed');
  console.log('visualizer-slots: passed');
  console.log('visualizer-composed-events: passed');
  console.log('visualizer-property-flow: passed');
  console.log('visualizer-css-properties: passed');
  console.log('visualizer-reactive-matter: passed');
} finally {
  socket.close(); browser.kill('SIGTERM'); await Promise.race([once(browser,'exit'),sleep(1000)]); await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50});
}

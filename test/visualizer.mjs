import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root=resolve(import.meta.dirname,'..')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const which=command=>spawnSync(process.platform==='win32'?'where':'which',[command],{encoding:'utf8'}).stdout.trim().split(/\r?\n/)[0]
const browserPath=[process.env.CHROME_BIN,which('chromium'),which('chromium-browser'),which('google-chrome'),which('google-chrome-stable')].filter(Boolean)[0]
if(!browserPath)throw new Error('Chrome/Chromium not found')

const paths=['visualizer/app.html','visualizer/shell.html','visualizer/scene.html','visualizer/hud.html','visualizer/dialogue.html']
const tags=['visualizer-app','visualizer-shell','visualizer-scene','visualizer-hud','visualizer-dialogue']
const fixtures=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(join(root,'examples',path),'utf8')])))
const runtime=await readFile(join(root,'skein.min.js'),'utf8')
const port=await new Promise((resolvePort,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolvePort(port))})})
const profile=await mkdtemp(join(tmpdir(),'skein-horror-'))
const browser=spawn(browserPath,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'})
const endpoint=`http://127.0.0.1:${port}`
let socket=null

async function target(){
  for(let i=0;i<300;i++){
    if(browser.exitCode!==null)throw new Error(`Chrome exited before CDP became ready: ${browser.exitCode}`)
    try{const tabs=await fetch(`${endpoint}/json`).then(r=>r.json());const page=tabs.find(item=>item.type==='page');if(page)return page}catch{}
    await sleep(50)
  }
  throw new Error('Chrome DevTools Protocol did not become ready within 15s')
}

try{
  const page=await target()
  socket=new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolveSocket,reject)=>{socket.onopen=resolveSocket;socket.onerror=reject})
  let requestId=0
  const pending=new Map(),exceptions=[]
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);return}if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)}
  const send=(method,params={})=>new Promise((resolveRequest,reject)=>{const id=++requestId;pending.set(id,{resolve:resolveRequest,reject});socket.send(JSON.stringify({id,method,params}))})
  await send('Runtime.enable');await send('Page.enable')
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
  const dialogueSnapshot=()=>evaluate(`(()=>{const d=document.querySelector('visualizer-app').state.state.dialogue;return{open:d.open,speaker:d.speaker,text:d.text,options:d.options.map(item=>({id:item.id,label:item.label}))}})()`)
  const stateSnapshot=()=>evaluate(`(()=>{const s=document.querySelector('visualizer-app').state.state;return{objective:s.objective,prompt:s.prompt,stamina:s.stamina,danger:s.danger,hidden:s.hidden,hasFuse:s.hasFuse,power:s.power,caught:s.caught,ending:s.ending}})()`)

  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id
  await send('Page.setDocumentContent',{frameId,html:'<!doctype html><html><head><base href="http://example.test/examples/"></head><body><visualizer-app></visualizer-app></body></html>'})
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`)
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`)

  let ready=false
  for(let i=0;i<240;i++){await sleep(25);ready=await evaluate(`document.querySelector('visualizer-app')?.shadowRoot?.querySelector('visualizer-scene')?.state?.status==='world live'`);if(ready)break}
  if(!ready)throw new Error(`The Night Shift did not mount: ${exceptions.join('\n')}`)

  const defined=await evaluate(`(${JSON.stringify(tags)}).filter(tag=>customElements.get(tag)).length`)
  if(defined!==tags.length)throw new Error(`Expected ${tags.length} horror component types, got ${defined}`)

  const contract=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{title:app.state.game.title,walls:app.state.game.walls.length,props:app.state.game.props.length,lockers:app.state.game.lockers.length,patrol:app.state.game.enemy.patrol.length,objective:app.state.state.objective,webgl:!!scene.shadowRoot.querySelector('canvas').getContext('webgl2')}})()`)
  if(contract.title!=='THE NIGHT SHIFT'||contract.walls<8||contract.props<5||contract.lockers!==2||contract.patrol<5||contract.objective!=='Find Dr. Mira at reception'||!contract.webgl)throw new Error(`Horror game contract failed: ${JSON.stringify(contract)}`)

  await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');scene.game.npc.position.x=0;scene.game.npc.position.z=7.1;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}))})()`)
  let dialogue={}
  for(let i=0;i<80;i++){await sleep(25);dialogue=await dialogueSnapshot();if(dialogue.open)break}
  if(!dialogue.open||dialogue.speaker!=='DR. MIRA VALE'||dialogue.options.length!==2)throw new Error(`NPC dialogue did not open: ${JSON.stringify(dialogue)}`)

  const dialogueRoot=`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-dialogue').shadowRoot`
  const initialButtons=await evaluate(`${dialogueRoot}.querySelectorAll('button').length`)
  if(initialButtons!==2)throw new Error(`Expected two dialogue choices, got ${initialButtons}`)

  await evaluate(`${dialogueRoot}.querySelector('button[data-id="elias"]').click()`);await sleep(80)
  dialogue=await dialogueSnapshot()
  if(!dialogue.text.includes('Patient 06')||dialogue.options[0]?.id!=='fuse')throw new Error(`Dialogue branch did not advance: ${JSON.stringify(dialogue)}`)

  await evaluate(`${dialogueRoot}.querySelector('button[data-id="fuse"]').click()`);await sleep(80)
  await evaluate(`${dialogueRoot}.querySelector('button[data-id="go"]').click()`);await sleep(100)
  const afterBriefing=await stateSnapshot()
  dialogue=await dialogueSnapshot()
  if(afterBriefing.objective!=='Reach Archive B and recover the spare fuse'||dialogue.open)throw new Error(`Briefing did not enter stealth phase: ${JSON.stringify({afterBriefing,dialogue})}`)

  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-scene').dispatchEvent(new CustomEvent('game-command',{detail:{action:'restart'}}))`);await sleep(100)
  const reset=await stateSnapshot()
  if(reset.objective!=='Find Dr. Mira at reception'||reset.hasFuse||reset.power||reset.caught||reset.ending)throw new Error(`Restart did not reset story state: ${JSON.stringify(reset)}`)

  if(exceptions.length)throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`)
  console.log('night-shift-webgl-mount: passed')
  console.log('night-shift-world-contract: passed')
  console.log('night-shift-npc-dialogue: passed')
  console.log('night-shift-dialogue-branching: passed')
  console.log('night-shift-story-phase: passed')
  console.log('night-shift-restart: passed')
}finally{
  try{socket?.close()}catch{}
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([once(browser,'exit'),sleep(1000)])}
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50})
}

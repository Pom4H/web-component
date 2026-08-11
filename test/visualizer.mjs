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

const paths=['visualizer/app.html','visualizer/shell.html','visualizer/scene.html','visualizer/controls.html','visualizer/inspector.html']
const tags=['visualizer-app','visualizer-shell','visualizer-scene','visualizer-controls','visualizer-inspector']
const fixtures=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(join(root,'examples',path),'utf8')])))
const runtime=await readFile(join(root,'skein.min.js'),'utf8')
const port=await new Promise((resolvePort,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolvePort(port))})})
const profile=await mkdtemp(join(tmpdir(),'skein-curvature-'))
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
  const pending=new Map()
  const exceptions=[]
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);return}if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)}
  const send=(method,params={})=>new Promise((resolveRequest,reject)=>{const id=++requestId;pending.set(id,{resolve:resolveRequest,reject});socket.send(JSON.stringify({id,method,params}))})
  await send('Runtime.enable');await send('Page.enable')
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
  const telemetry=()=>evaluate(`(()=>{const t=document.querySelector('visualizer-app').state.telemetry;return{score:t.score,speed:t.speed,contacts:t.contacts,simTime:t.simTime,thrust:t.thrust,position:{x:t.position.x,y:t.position.y,z:t.position.z}}})()`)

  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id
  await send('Page.setDocumentContent',{frameId,html:'<!doctype html><html><head><base href="http://example.test/examples/"></head><body><visualizer-app></visualizer-app></body></html>'})
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`)
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`)

  let ready=false
  for(let i=0;i<240;i++){await sleep(25);ready=await evaluate(`document.querySelector('visualizer-app')?.shadowRoot?.querySelector('visualizer-scene')?.state?.status==='simulation live'`);if(ready)break}
  if(!ready)throw new Error(`Curvature Arena did not mount: ${exceptions.join('\n')}`)

  const defined=await evaluate(`(${JSON.stringify(tags)}).filter(tag=>customElements.get(tag)).length`)
  if(defined!==tags.length)throw new Error(`Expected ${tags.length} component types, got ${defined}`)

  const contract=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{entities:app.state.world.entities.length,systems:app.state.world.systems.length,fixedHz:app.state.world.rules.fixedHz,sceneEntities:scene.state.world.entities.length,order:scene.state.systemOrder,webgl:!!scene.shadowRoot.querySelector('canvas').getContext('webgl2')}})()`)
  if(contract.entities!==10||contract.systems!==5||contract.fixedHz!==120||contract.sceneEntities!==10||contract.order!=='input → forces → integrate → bounds → collect'||!contract.webgl)throw new Error(`World contract failed: ${JSON.stringify(contract)}`)

  let state={}
  for(let i=0;i<40;i++){await sleep(30);state=await telemetry();if(state.simTime>.15)break}
  if(!(state.simTime>.15))throw new Error(`Fixed-step simulation did not advance: ${JSON.stringify(state)}`)

  const controls=`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot`
  await evaluate(`${controls}.querySelector('button[data-action="run"]').click()`)
  await sleep(90)
  const pausedAt=(await telemetry()).simTime
  await sleep(180)
  state=await telemetry()
  if(Math.abs(state.simTime-pausedAt)>.02)throw new Error(`Pause did not stop integration: ${pausedAt} -> ${state.simTime}`)

  await evaluate(`(()=>{const i=${controls}.querySelector('input[data-control="time"]');i.valueAsNumber=1.5;i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await evaluate(`(()=>{const i=${controls}.querySelector('input[data-control="field"]');i.valueAsNumber=.6;i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await sleep(40)
  let flow=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{time:app.state.timeScale,sceneTime:scene.state.timeScale,field:app.state.fieldScale,sceneField:scene.state.fieldScale}})()`)
  if(flow.time!==1.5||flow.sceneTime!==1.5||Math.abs(flow.field-.6)>.001||Math.abs(flow.sceneField-.6)>.001)throw new Error(`Property flow failed: ${JSON.stringify(flow)}`)

  const nativeCase=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene'),input=${controls}.querySelector('input[data-control="time"]');return{sceneTimeScale:scene.timeScale,lowercaseSceneExpando:Object.hasOwn(scene,'timescale'),valueAsNumber:input.valueAsNumber,lowercaseInputExpando:Object.hasOwn(input,'valueasnumber')}})()`)
  if(nativeCase.sceneTimeScale!==1.5||nativeCase.lowercaseSceneExpando||nativeCase.valueAsNumber!==1.5||nativeCase.lowercaseInputExpando)throw new Error(`Case-sensitive property contract failed: ${JSON.stringify(nativeCase)}`)

  const token=await evaluate(`document.querySelector('visualizer-app').state.resetToken`)
  await evaluate(`${controls}.querySelector('button[data-action="reset"]').click()`);await sleep(130)
  state=await telemetry();const resetToken=await evaluate(`document.querySelector('visualizer-app').state.resetToken`)
  if(resetToken!==token+1||state.score!==0||state.simTime>.03)throw new Error(`Deterministic reset failed: ${JSON.stringify({resetToken,state})}`)

  await evaluate(`${controls}.querySelector('button[data-action="run"]').click()`)
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}))`);await sleep(160);state=await telemetry();await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}))`)
  if(state.thrust<=0)throw new Error(`Input did not feed physics: ${JSON.stringify(state)}`)

  await evaluate(`${controls}.querySelector('button[data-action="run"]').click()`)
  await evaluate(`(()=>{const app=document.querySelector('visualizer-app');app.state.world.systems=app.state.world.systems.filter(system=>system.id!=='input')})()`)
  await evaluate(`${controls}.querySelector('button[data-action="reset"]').click()`);await sleep(120)
  await evaluate(`${controls}.querySelector('button[data-action="run"]').click()`)
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}))`);await sleep(160);state=await telemetry();await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}))`)
  if(state.thrust>.01)throw new Error(`Declared system schedule did not control execution: ${JSON.stringify(state)}`)

  flow=await evaluate(`(()=>{const scene=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-scene');return{thrust:scene.style.getPropertyValue('--thrust'),danger:scene.style.getPropertyValue('--danger'),parts:['world','canvas','math','hud'].every(name=>!!scene.shadowRoot.querySelector('[part~="'+name+'"]'))}})()`)
  if(!flow.thrust||!flow.danger||!flow.parts)throw new Error(`Native styling contract failed: ${JSON.stringify(flow)}`)
  if(exceptions.length)throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`)

  console.log('curvature-arena-webgl: passed')
  console.log('curvature-arena-fixed-step: passed')
  console.log('curvature-arena-ecs-world: passed')
  console.log('curvature-arena-system-schedule: passed')
  console.log('curvature-arena-property-flow: passed')
  console.log('curvature-arena-input-system: passed')
  console.log('curvature-arena-design-contracts: passed')
}finally{
  try{socket?.close()}catch{}
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([once(browser,'exit'),sleep(1000)])}
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50})
}

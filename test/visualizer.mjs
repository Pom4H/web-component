import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
const which = command => spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding:'utf8' }).stdout.trim().split(/\r?\n/)[0]
const browserPath = [
  process.env.CHROME_BIN,
  which('chromium'),
  which('chromium-browser'),
  which('google-chrome'),
  which('google-chrome-stable')
].filter(Boolean)[0]
if (!browserPath) throw new Error('Chrome/Chromium not found')

const paths = [
  'visualizer/app.html',
  'visualizer/shell.html',
  'visualizer/scene.html',
  'visualizer/controls.html',
  'visualizer/inspector.html'
]
const tags = [
  'visualizer-app',
  'visualizer-shell',
  'visualizer-scene',
  'visualizer-controls',
  'visualizer-inspector'
]
const fixtures = Object.fromEntries(await Promise.all(
  paths.map(async path => [path, await readFile(join(root,'examples',path),'utf8')])
))
const runtime = await readFile(join(root,'skein.min.js'),'utf8')

const port = await new Promise((resolvePort,reject) => {
  const server=createServer()
  server.on('error',reject)
  server.listen(0,'127.0.0.1',()=> {
    const {port}=server.address()
    server.close(()=>resolvePort(port))
  })
})
const profile = await mkdtemp(join(tmpdir(),'skein-curvature-'))
const browser = spawn(browserPath,[
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank'
],{stdio:'ignore'})
const endpoint=`http://127.0.0.1:${port}`

async function target(){
  for(let i=0;i<100;i++){
    try{
      const tabs=await fetch(`${endpoint}/json`).then(r=>r.json())
      const page=tabs.find(item=>item.type==='page')
      if(page)return page
    }catch{}
    await sleep(50)
  }
  throw new Error('Chrome DevTools Protocol did not become ready')
}

const page=await target()
const socket=new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolveSocket,reject)=>{
  socket.onopen=resolveSocket
  socket.onerror=reject
})
let requestId=0
const pending=new Map()
const exceptions=[]
socket.onmessage=event=>{
  const message=JSON.parse(event.data)
  if(message.id&&pending.has(message.id)){
    const item=pending.get(message.id)
    pending.delete(message.id)
    message.error?item.reject(new Error(message.error.message)):item.resolve(message.result)
    return
  }
  if(message.method==='Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text)
  }
}
const send=(method,params={})=>new Promise((resolveRequest,reject)=>{
  const id=++requestId
  pending.set(id,{resolve:resolveRequest,reject})
  socket.send(JSON.stringify({id,method,params}))
})
await send('Runtime.enable')
await send('Page.enable')
const evaluate=async expression=>{
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text)
  return result.result.value
}

try {
  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id
  await send('Page.setDocumentContent',{
    frameId,
    html:'<!doctype html><html><head><base href="http://example.test/examples/"></head><body><visualizer-app></visualizer-app></body></html>'
  })
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`)
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`)

  let ready=false
  for(let i=0;i<240;i++){
    await sleep(25)
    ready=await evaluate(`document.querySelector('visualizer-app')?.shadowRoot?.querySelector('visualizer-scene')?.state?.status==='simulation live'`)
    if(ready)break
  }
  if(!ready) throw new Error(`Curvature Arena did not mount: ${exceptions.join('\n')}`)

  const defined=await evaluate(`(${JSON.stringify(tags)}).filter(tag=>customElements.get(tag)).length`)
  if(defined!==tags.length) throw new Error(`Expected ${tags.length} component types, got ${defined}`)

  let state=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{fields:app.state.fields.length,fixedHz:app.state.rules.fixedHz,status:scene.state.status,webgl:!!scene.shadowRoot.querySelector('canvas').getContext('webgl2'),simTime:app.state.telemetry.simTime,position:app.state.telemetry.position}})()`)
  if(state.fields!==3||state.fixedHz!==120||!state.webgl||state.status!=='simulation live') {
    throw new Error(`World contract failed: ${JSON.stringify(state)}`)
  }

  let progressed=false
  for(let i=0;i<40;i++){
    await sleep(30)
    state=await evaluate(`document.querySelector('visualizer-app').state.telemetry`)
    if(state.simTime>.15){progressed=true;break}
  }
  if(!progressed) throw new Error(`Fixed-step simulation did not advance: ${JSON.stringify(state)}`)
  const beforePause=state.simTime

  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('button[data-action="run"]').click()`)
  await sleep(180)
  state=await evaluate(`document.querySelector('visualizer-app').state.telemetry`)
  if(Math.abs(state.simTime-beforePause)>.03) throw new Error(`Pause did not stop fixed-step integration: ${beforePause} -> ${state.simTime}`)

  await evaluate(`(()=>{const input=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('input[data-control="time"]');input.valueAsNumber=1.5;input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await sleep(30)
  let flow=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{app:app.state.timeScale,scene:scene.state.timeScale}})()`)
  if(flow.app!==1.5||flow.scene!==1.5) throw new Error(`Time-scale property flow failed: ${JSON.stringify(flow)}`)

  await evaluate(`(()=>{const input=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('input[data-control="field"]');input.valueAsNumber=.6;input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await sleep(30)
  flow=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{app:app.state.fieldScale,scene:scene.state.fieldScale}})()`)
  if(Math.abs(flow.app-.6)>.001||Math.abs(flow.scene-.6)>.001) throw new Error(`Field-scale property flow failed: ${JSON.stringify(flow)}`)

  const beforeReset=await evaluate(`document.querySelector('visualizer-app').state.resetToken`)
  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('button[data-action="reset"]').click()`)
  await sleep(130)
  flow=await evaluate(`(()=>{const app=document.querySelector('visualizer-app');return{token:app.state.resetToken,score:app.state.telemetry.score,simTime:app.state.telemetry.simTime}})()`)
  if(flow.token!==beforeReset+1||flow.score!==0||flow.simTime>.03) throw new Error(`Deterministic reset failed: ${JSON.stringify(flow)}`)

  await evaluate(`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot.querySelector('button[data-action="run"]').click()`)
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}))`)
  await sleep(150)
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}))`)
  flow=await evaluate(`document.querySelector('visualizer-app').state.telemetry`)
  if(flow.thrust<=0) throw new Error(`Input system did not feed physics: ${JSON.stringify(flow)}`)

  const sceneContract=await evaluate(`(()=>{const scene=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-scene');return{thrust:scene.style.getPropertyValue('--thrust'),danger:scene.style.getPropertyValue('--danger'),parts:['world','canvas','math','hud'].map(name=>!!scene.shadowRoot.querySelector('[part~="'+name+'"]'))}})()`)
  if(!sceneContract.thrust||!sceneContract.danger||sceneContract.parts.some(value=>!value)) {
    throw new Error(`Native styling contract failed: ${JSON.stringify(sceneContract)}`)
  }

  if(exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`)
  console.log('curvature-arena-webgl: passed')
  console.log('curvature-arena-fixed-step: passed')
  console.log('curvature-arena-property-flow: passed')
  console.log('curvature-arena-input-system: passed')
  console.log('curvature-arena-design-contracts: passed')
} finally {
  socket.close()
  browser.kill('SIGTERM')
  await Promise.race([once(browser,'exit'),sleep(1000)])
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50})
}

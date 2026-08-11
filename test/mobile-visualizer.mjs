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
const fixtures=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(join(root,'examples',path),'utf8')])))
const runtime=await readFile(join(root,'skein.min.js'),'utf8')
const port=await new Promise((resolvePort,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolvePort(port))})})
const profile=await mkdtemp(join(tmpdir(),'skein-horror-mobile-'))
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
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}

  await send('Runtime.enable');await send('Page.enable')
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true,screenWidth:390,screenHeight:844})

  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id
  await send('Page.setDocumentContent',{frameId,html:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base href="http://example.test/examples/"></head><body style="margin:0"><visualizer-app></visualizer-app></body></html>'})
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`)
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`)

  let ready=false
  for(let i=0;i<240;i++){await sleep(25);ready=await evaluate(`document.querySelector('visualizer-app')?.shadowRoot?.querySelector('visualizer-scene')?.state?.status==='world live'`);if(ready)break}
  if(!ready)throw new Error(`Mobile horror demo did not mount: ${exceptions.join('\n')}`)

  let layout=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),root=app.shadowRoot,shell=root.querySelector('visualizer-shell'),shellRoot=shell.shadowRoot,canvas=root.querySelector('visualizer-scene').shadowRoot.querySelector('canvas'),mast=shellRoot.querySelector('.mast'),box=canvas.getBoundingClientRect();return{mast:getComputedStyle(mast).display,width:box.width,height:box.height,overflow:document.documentElement.scrollWidth-innerWidth}})()`)
  if(layout.mast!=='none'||layout.width<389||layout.height<843||layout.overflow>1)throw new Error(`Portrait horror layout failed: ${JSON.stringify(layout)}`)

  await evaluate(`(()=>{const scene=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-scene');scene.game.npc.position.x=0;scene.game.npc.position.z=7.1;window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}))})()`);await sleep(100)
  const dialogueLayout=await evaluate(`(()=>{const root=document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-dialogue').shadowRoot,section=root.querySelector('.dialogue'),button=root.querySelector('button'),box=section.getBoundingClientRect(),b=button.getBoundingClientRect();return{visible:getComputedStyle(section).display,width:box.width,buttonHeight:b.height,overflow:box.right-innerWidth}})()`)
  if(dialogueLayout.visible==='none'||dialogueLayout.width>390||dialogueLayout.buttonHeight<38||dialogueLayout.overflow>1)throw new Error(`Mobile dialogue layout failed: ${JSON.stringify(dialogueLayout)}`)

  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:3,mobile:true,screenWidth:844,screenHeight:390})
  await sleep(80)
  layout=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),canvas=app.shadowRoot.querySelector('visualizer-scene').shadowRoot.querySelector('canvas'),box=canvas.getBoundingClientRect();return{width:box.width,height:box.height,overflow:document.documentElement.scrollWidth-innerWidth}})()`)
  if(layout.width<843||layout.height<389||layout.overflow>1)throw new Error(`Landscape horror layout failed: ${JSON.stringify(layout)}`)

  if(exceptions.length)throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`)
  console.log('night-shift-mobile-portrait: passed')
  console.log('night-shift-mobile-dialogue: passed')
  console.log('night-shift-mobile-landscape: passed')
}finally{
  try{socket?.close()}catch{}
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([once(browser,'exit'),sleep(1000)])}
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50})
}

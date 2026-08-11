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

const shell=await readFile(join(root,'examples/visualizer/shell.html'),'utf8')
const runtime=await readFile(join(root,'skein.min.js'),'utf8')
const port=await new Promise((resolvePort,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolvePort(port))})})
const profile=await mkdtemp(join(tmpdir(),'skein-mobile-'))
const browser=spawn(browserPath,['--headless=new','--no-sandbox','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'})
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
  socket.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result)}}
  const send=(method,params={})=>new Promise((resolveRequest,reject)=>{const id=++requestId;pending.set(id,{resolve:resolveRequest,reject});socket.send(JSON.stringify({id,method,params}))})
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true,screenWidth:390,screenHeight:844})

  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id
  await send('Page.setDocumentContent',{frameId,html:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base href="http://example.test/examples/"></head><body style="margin:0"><visualizer-shell></visualizer-shell></body></html>'})
  await evaluate(`window.fetch=async url=>new URL(String(url)).pathname.endsWith('/visualizer/shell.html')?new Response(${JSON.stringify(shell)},{status:200}):new Response('',{status:404})`)
  await evaluate(`window.__mobileKeys=[];for(const type of ['keydown','keyup'])window.addEventListener(type,event=>window.__mobileKeys.push(type+':'+event.code))`)
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`)

  let mounted=false
  for(let i=0;i<160;i++){await sleep(25);mounted=await evaluate(`!!document.querySelector('visualizer-shell')?.shadowRoot?.querySelector('.mobile-gamepad')`);if(mounted)break}
  if(!mounted)throw new Error('Mobile gamepad did not mount')

  let layout=await evaluate(`(()=>{const root=document.querySelector('visualizer-shell').shadowRoot,pad=root.querySelector('.mobile-gamepad'),left=root.querySelector('[data-key="KeyA"]'),depth=root.querySelector('[data-key="KeyE"]'),box=left.getBoundingClientRect(),depthBox=depth.getBoundingClientRect();return{display:getComputedStyle(pad).display,leftWidth:box.width,leftHeight:box.height,depthWidth:depthBox.width,overflow:document.documentElement.scrollWidth-window.innerWidth}})()`)
  if(layout.display==='none'||layout.leftWidth<44||layout.leftHeight<44||layout.depthWidth<44||layout.overflow>1)throw new Error(`Portrait mobile layout failed: ${JSON.stringify(layout)}`)

  const fire=async(selector,type,id)=>evaluate(`(()=>{const el=document.querySelector('visualizer-shell').shadowRoot.querySelector(${JSON.stringify(selector)});el.dispatchEvent(new PointerEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,pointerId:${id},pointerType:'touch',isPrimary:${id===1},button:0,buttons:${type==='pointerdown'?1:0}}))})()`)

  await fire('[data-key="KeyD"]','pointerdown',1)
  await fire('[data-key="KeyD"]','pointerup',1)
  let keys=await evaluate('window.__mobileKeys.slice()')
  if(!keys.includes('keydown:KeyD')||!keys.includes('keyup:KeyD'))throw new Error(`Single-touch steering failed: ${JSON.stringify(keys)}`)

  await evaluate('window.__mobileKeys.length=0')
  await fire('[data-key="KeyW"]','pointerdown',11)
  await fire('[data-key="KeyE"]','pointerdown',12)
  await fire('[data-key="KeyW"]','pointerup',11)
  await fire('[data-key="KeyE"]','pointerup',12)
  keys=await evaluate('window.__mobileKeys.slice()')
  for(const expected of ['keydown:KeyW','keydown:KeyE','keyup:KeyW','keyup:KeyE'])if(!keys.includes(expected))throw new Error(`Multitouch flight control failed: ${JSON.stringify(keys)}`)

  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:3,mobile:true,screenWidth:844,screenHeight:390})
  await sleep(60)
  layout=await evaluate(`(()=>{const root=document.querySelector('visualizer-shell').shadowRoot,pad=root.querySelector('.mobile-gamepad');return{display:getComputedStyle(pad).display,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth}})()`)
  if(layout.display==='none'||layout.overflow>1)throw new Error(`Landscape mobile layout failed: ${JSON.stringify(layout)}`)

  console.log('curvature-arena-mobile-layout: passed')
  console.log('curvature-arena-mobile-touch: passed')
  console.log('curvature-arena-mobile-multitouch: passed')
  console.log('curvature-arena-mobile-landscape: passed')
}finally{
  try{socket?.close()}catch{}
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([once(browser,'exit'),sleep(1000)])}
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50})
}

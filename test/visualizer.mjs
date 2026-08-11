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

const paths=['visualizer/app.html','visualizer/shell.html','visualizer/scene.html','visualizer/controls.html','visualizer/gamepad.html','visualizer/inspector.html']
const tags=['visualizer-app','visualizer-shell','visualizer-scene','visualizer-controls','visualizer-gamepad','visualizer-inspector']
const fixtures=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await readFile(join(root,'examples',path),'utf8')])))
const runtime=await readFile(join(root,'skein.min.js'),'utf8')
const port=await new Promise((resolvePort,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolvePort(port))})})
const profile=await mkdtemp(join(tmpdir(),'skein-voxel-'))
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
  const telemetry=()=>evaluate(`(()=>{const t=document.querySelector('visualizer-app').state.telemetry;return{position:{...t.position},speed:t.speed,grounded:t.grounded,blocks:t.blocks,target:t.target,inventory:{...t.inventory},crafted:t.crafted,message:t.message}})()`)
  const gamepad=`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-gamepad').shadowRoot`

  const frameId=(await send('Page.getFrameTree')).frameTree.frame.id
  await send('Page.setDocumentContent',{frameId,html:'<!doctype html><html><head><base href="http://example.test/examples/"></head><body><visualizer-app></visualizer-app></body></html>'})
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`)
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(runtime)}],{type:'text/javascript'}));await import(url)})()`)

  let ready=false
  for(let i=0;i<240;i++){await sleep(25);ready=await evaluate(`document.querySelector('visualizer-app')?.shadowRoot?.querySelector('visualizer-scene')?.state?.status==='world live'`);if(ready)break}
  if(!ready)throw new Error(`Voxel Meadow did not mount: ${exceptions.join('\n')}`)

  const defined=await evaluate(`(${JSON.stringify(tags)}).filter(tag=>customElements.get(tag)).length`)
  if(defined!==tags.length)throw new Error(`Expected ${tags.length} component types, got ${defined}`)

  const contract=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),scene=app.shadowRoot.querySelector('visualizer-scene');return{entities:app.state.world.entities.length,systems:app.state.world.systems.length,recipes:app.state.world.recipes.length,fixedHz:app.state.world.rules.fixedHz,order:scene.state.systemOrder,webgl:!!scene.shadowRoot.querySelector('canvas').getContext('webgl2')}})()`)
  if(contract.entities!==2||contract.systems!==5||contract.recipes!==1||contract.fixedHz!==120||contract.order!=='input → gravity → locomotion → voxel-collision → interact'||!contract.webgl)throw new Error(`World contract failed: ${JSON.stringify(contract)}`)

  let state={}
  for(let i=0;i<80;i++){await sleep(30);state=await telemetry();if(state.grounded&&state.blocks>1000&&state.target!=='none')break}
  if(!state.grounded||state.blocks<=1000||state.target==='none')throw new Error(`Player did not land on targetable voxel terrain: ${JSON.stringify(state)}`)
  const spawn={...state.position}

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}))`);await sleep(220);await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}))`);await sleep(60)
  state=await telemetry()
  if(!(state.position.x>spawn.x+.25))throw new Error(`Keyboard locomotion did not move grounded player: ${JSON.stringify({spawn,state})}`)

  const controls=`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot`
  await evaluate(`${controls}.querySelector('button[data-action="reset"]').click()`)
  for(let i=0;i<60;i++){await sleep(25);state=await telemetry();if(state.grounded&&Math.abs(state.position.x-.5)<.1)break}

  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true,screenWidth:390,screenHeight:844})
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
  await sleep(120)
  const mobile=await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),pad=app.shadowRoot.querySelector('visualizer-gamepad'),button=pad.shadowRoot.querySelector('.right');const style=getComputedStyle(pad);const rect=button.getBoundingClientRect();return{display:style.display,width:rect.width,height:rect.height}})()`)
  if(mobile.display==='none'||mobile.width<44||mobile.height<44)throw new Error(`Mobile gamepad is not usable: ${JSON.stringify(mobile)}`)

  await evaluate(`(()=>{const app=document.querySelector('visualizer-app'),pad=app.shadowRoot.querySelector('visualizer-gamepad'),scene=app.shadowRoot.querySelector('visualizer-scene');window.__voxelTrace={gameAction:[],gameCommand:[]};pad.addEventListener('game-action',event=>window.__voxelTrace.gameAction.push(event.detail?.action));scene.addEventListener('game-command',event=>window.__voxelTrace.gameCommand.push(event.detail?.action))})()`)

  const beforeMobile=await telemetry()
  await evaluate(`(()=>{const b=${gamepad}.querySelector('.right');b.dispatchEvent(new PointerEvent('pointerdown',{pointerId:41,pointerType:'touch',bubbles:true}));})()`)
  await sleep(230)
  const held=await evaluate(`document.querySelector('visualizer-app').state.controls.x`)
  state=await telemetry()
  await evaluate(`(()=>{const b=${gamepad}.querySelector('.right');b.dispatchEvent(new PointerEvent('pointerup',{pointerId:41,pointerType:'touch',bubbles:true}));})()`)
  await sleep(80)
  const released=await evaluate(`document.querySelector('visualizer-app').state.controls.x`)
  if(held!==1||released!==0||!(state.position.x>beforeMobile.position.x+.2))throw new Error(`Touch movement did not flow through typed game input: ${JSON.stringify({held,released,beforeMobile,state})}`)

  await evaluate(`${controls}.querySelector('button[data-action="reset"]').click()`)
  for(let i=0;i<60;i++){await sleep(25);state=await telemetry();if(state.grounded&&state.target!=='none'&&Math.abs(state.position.x-.5)<.1)break}
  const y0=state.position.y
  await evaluate(`${gamepad}.querySelector('[data-action="jump"]').click()`)
  await sleep(140);state=await telemetry()
  if(!(state.position.y>y0+.12)||state.grounded)throw new Error(`Jump did not leave voxel ground: ${JSON.stringify({y0,state,trace:await evaluate('window.__voxelTrace')})}`)

  await evaluate(`${controls}.querySelector('button[data-action="reset"]').click()`)
  for(let i=0;i<60;i++){await sleep(25);state=await telemetry();if(state.grounded&&state.target!=='none')break}

  await evaluate(`window.__voxelTrace={gameAction:[],gameCommand:[]}`)
  const beforeCraft=await telemetry()
  await evaluate(`${gamepad}.querySelector('[data-action="craft"]').click()`)
  await sleep(160);state=await telemetry()
  const craftTrace=await evaluate('window.__voxelTrace')
  if(state.inventory.wood!==beforeCraft.inventory.wood-2||state.inventory.plank!==beforeCraft.inventory.plank+4||state.crafted!==beforeCraft.crafted+1)throw new Error(`Craft recipe did not mutate typed inventory: ${JSON.stringify({beforeCraft,state,craftTrace})}`)

  await evaluate(`window.__voxelTrace={gameAction:[],gameCommand:[]}`)
  const beforeMine=await telemetry(),beforeInventory=Object.values(beforeMine.inventory).reduce((a,b)=>a+b,0)
  await evaluate(`${gamepad}.querySelector('[data-action="mine"]').click()`)
  await sleep(160);state=await telemetry()
  const mineTrace=await evaluate('window.__voxelTrace')
  const afterInventory=Object.values(state.inventory).reduce((a,b)=>a+b,0)
  if(state.blocks!==beforeMine.blocks-1||afterInventory!==beforeInventory+1)throw new Error(`Mining did not remove a voxel and add inventory: ${JSON.stringify({beforeMine,state,mineTrace})}`)

  await evaluate(`window.__voxelTrace={gameAction:[],gameCommand:[]}`)
  const beforePlace=await telemetry(),placeInventory=Object.values(beforePlace.inventory).reduce((a,b)=>a+b,0)
  await evaluate(`${gamepad}.querySelector('[data-action="place"]').click()`)
  await sleep(160);state=await telemetry()
  const placeTrace=await evaluate('window.__voxelTrace')
  const placedInventory=Object.values(state.inventory).reduce((a,b)=>a+b,0)
  if(state.blocks!==beforePlace.blocks+1||placedInventory!==placeInventory-1)throw new Error(`Placing did not create a voxel from inventory: ${JSON.stringify({beforePlace,state,placeTrace})}`)

  if(exceptions.length)throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`)
  console.log('voxel-meadow-webgl-cubes: passed')
  console.log('voxel-meadow-ground-collision: passed')
  console.log('voxel-meadow-player-locomotion: passed')
  console.log('voxel-meadow-mobile-direct-input: passed')
  console.log('voxel-meadow-jump: passed')
  console.log('voxel-meadow-mining: passed')
  console.log('voxel-meadow-placement: passed')
  console.log('voxel-meadow-crafting: passed')
  console.log('voxel-meadow-design-contracts: passed')
}finally{
  try{socket?.close()}catch{}
  if(browser.exitCode===null){browser.kill('SIGTERM');await Promise.race([once(browser,'exit'),sleep(1000)])}
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50})
}

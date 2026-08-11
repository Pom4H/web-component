import { readFile, writeFile } from 'node:fs/promises'

const scenePath = new URL('../examples/visualizer/scene.html', import.meta.url)
let scene = await readFile(scenePath, 'utf8')
const sceneReplacements = [
  ["  this.inventory={dirt:0,stone:0,wood:0,plank:0}\n", "  this.inventory={dirt:0,stone:0,wood:0,plank:0}\n  this.epoch=0\n"],
  ["    generate()\n\n    const add=", "    generate()\n    this.epoch=lastReset\n\n    const add="],
  ["      if(this.resetToken!==lastReset){lastReset=this.resetToken;generate();accumulator=0}", "      if(this.resetToken!==lastReset){lastReset=this.resetToken;generate();this.epoch=lastReset;accumulator=0}"],
  ["        host.dispatchEvent(new CustomEvent('world-telemetry',{detail:{\n          position:", "        host.dispatchEvent(new CustomEvent('world-telemetry',{detail:{\n          epoch:this.epoch,\n          position:"]
]
for (const [from,to] of sceneReplacements) {
  if (!scene.includes(from)) throw new Error(`scene marker missing: ${from.slice(0,90)}`)
  scene = scene.replace(from,to)
}
await writeFile(scenePath, scene)

const testPath = new URL('../test/visualizer.mjs', import.meta.url)
let test = await readFile(testPath, 'utf8')
const telemetryFrom = "const t=document.querySelector('visualizer-app').state.telemetry;return{position:{...t.position},speed:t.speed,grounded:t.grounded,blocks:t.blocks,target:t.target,inventory:{...t.inventory},crafted:t.crafted,message:t.message}"
const telemetryTo = "const t=document.querySelector('visualizer-app').state.telemetry;return{epoch:t.epoch,position:{...t.position},speed:t.speed,grounded:t.grounded,blocks:t.blocks,target:t.target,inventory:{...t.inventory},crafted:t.crafted,message:t.message}"
if (!test.includes(telemetryFrom)) throw new Error('test telemetry marker missing')
test = test.replace(telemetryFrom, telemetryTo)

const controlsMarker = "  const controls=`document.querySelector('visualizer-app').shadowRoot.querySelector('visualizer-controls').shadowRoot`\n"
const controlsWithHelper = `${controlsMarker}  const resetWorld=async()=>{\n    const previousEpoch=(await telemetry()).epoch\n    await evaluate(\`${'${controls}'}.querySelector('button[data-action=\\\"reset\\\"]').click()\`)\n    let current={}\n    for(let i=0;i<100;i++){\n      await sleep(25)\n      current=await telemetry()\n      if(current.epoch===previousEpoch+1&&current.grounded&&current.target!=='none'&&Math.abs(current.position.x-.5)<.1)return current\n    }\n    throw new Error(\`Voxel reset did not reach a grounded new epoch: ${'${JSON.stringify({previousEpoch,current})}'}\`)\n  }\n`
if (!test.includes(controlsMarker)) throw new Error('controls marker missing')
test = test.replace(controlsMarker, controlsWithHelper)

const resetA = `  await evaluate(\`${'${controls}'}.querySelector('button[data-action="reset"]').click()\`)\n  for(let i=0;i<60;i++){await sleep(25);state=await telemetry();if(state.grounded&&Math.abs(state.position.x-.5)<.1)break}`
const resetB = `  await evaluate(\`${'${controls}'}.querySelector('button[data-action="reset"]').click()\`)\n  for(let i=0;i<60;i++){await sleep(25);state=await telemetry();if(state.grounded&&state.target!=='none'&&Math.abs(state.position.x-.5)<.1)break}`
const resetC = `  await evaluate(\`${'${controls}'}.querySelector('button[data-action="reset"]').click()\`)\n  for(let i=0;i<60;i++){await sleep(25);state=await telemetry();if(state.grounded&&state.target!=='none')break}`
for (const marker of [resetA, resetB, resetC]) {
  if (!test.includes(marker)) throw new Error(`reset marker missing: ${marker.slice(0,100)}`)
  test = test.replace(marker, "  state=await resetWorld()")
}
await writeFile(testPath, test)

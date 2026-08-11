import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../examples/visualizer/scene.html', import.meta.url)
let source = await readFile(path, 'utf8')

const marker = "    let lastActions={...this.actions}\n    const keys=new Set()"
const replacement = `    let lastActions={...this.actions}\n    const pendingActions={jump:0,mine:0,place:0,craft:0}\n    effect(()=>{\n      const next=this.actions\n      const jump=next.jump-lastActions.jump\n      const mine=next.mine-lastActions.mine\n      const place=next.place-lastActions.place\n      const craft=next.craft-lastActions.craft\n      if(jump>0)pendingActions.jump+=jump\n      if(mine>0)pendingActions.mine+=mine\n      if(place>0)pendingActions.place+=place\n      if(craft>0)pendingActions.craft+=craft\n      lastActions={...next}\n    })\n    const keys=new Set()`

if (!source.includes(marker)) throw new Error('command-buffer insertion marker not found')
source = source.replace(marker, replacement)

const oldBlock = `        frame.jump=this.actions.jump!==lastActions.jump\n        frame.mine=this.actions.mine!==lastActions.mine\n        frame.place=this.actions.place!==lastActions.place\n        frame.craft=this.actions.craft!==lastActions.craft\n        lastActions={...this.actions}`
const newBlock = `        frame.jump=pendingActions.jump>0\n        frame.mine=pendingActions.mine>0\n        frame.place=pendingActions.place>0\n        frame.craft=pendingActions.craft>0\n        if(frame.jump)pendingActions.jump--\n        if(frame.mine)pendingActions.mine--\n        if(frame.place)pendingActions.place--\n        if(frame.craft)pendingActions.craft--`

if (!source.includes(oldBlock)) throw new Error('command-buffer consume marker not found')
source = source.replace(oldBlock, newBlock)

await writeFile(path, source)

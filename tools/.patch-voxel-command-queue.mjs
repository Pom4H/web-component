import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../examples/visualizer/scene.html', import.meta.url)
let source = await readFile(path, 'utf8')

const replacements = [
  ["  /** @typedef {{ jump:number, mine:number, place:number, craft:number }} GameActions */", "  /** @typedef {'jump'|'mine'|'place'|'craft'} GameCommand */"],
  ["  input('actions', /** @type {GameActions} */ ({jump:0,mine:0,place:0,craft:0}))", "  input('commands', /** @type {GameCommand[]} */ ([]))"],
  [`    let lastReset=this.resetToken\n    let lastActions={...this.actions}\n    const pendingActions={jump:0,mine:0,place:0,craft:0}\n    effect(()=>{\n      const next=this.actions\n      const jump=next.jump-lastActions.jump\n      const mine=next.mine-lastActions.mine\n      const place=next.place-lastActions.place\n      const craft=next.craft-lastActions.craft\n      if(jump>0)pendingActions.jump+=jump\n      if(mine>0)pendingActions.mine+=mine\n      if(place>0)pendingActions.place+=place\n      if(craft>0)pendingActions.craft+=craft\n      lastActions={...next}\n    })\n    const keys=new Set()`, `    let lastReset=this.resetToken\n    const keys=new Set()`],
  [`      if(event.code==='Space')this.actions={...this.actions,jump:this.actions.jump+1}\n      if(event.code==='KeyF')this.actions={...this.actions,mine:this.actions.mine+1}\n      if(event.code==='KeyG')this.actions={...this.actions,place:this.actions.place+1}\n      if(event.code==='KeyC')this.actions={...this.actions,craft:this.actions.craft+1}`, `      if(event.code==='Space')this.commands.push('jump')\n      if(event.code==='KeyF')this.commands.push('mine')\n      if(event.code==='KeyG')this.commands.push('place')\n      if(event.code==='KeyC')this.commands.push('craft')`],
  [`        frame.jump=pendingActions.jump>0\n        frame.mine=pendingActions.mine>0\n        frame.place=pendingActions.place>0\n        frame.craft=pendingActions.craft>0\n        if(frame.jump)pendingActions.jump--\n        if(frame.mine)pendingActions.mine--\n        if(frame.place)pendingActions.place--\n        if(frame.craft)pendingActions.craft--`, `        const command=this.commands.shift()\n        frame.jump=command==='jump'\n        frame.mine=command==='mine'\n        frame.place=command==='place'\n        frame.craft=command==='craft'`]
]

for (const [from,to] of replacements) {
  if (!source.includes(from)) throw new Error(`scene replacement marker not found: ${from.slice(0,80)}`)
  source = source.replace(from,to)
}

await writeFile(path, source)

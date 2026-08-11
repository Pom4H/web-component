import { readFile, writeFile } from 'node:fs/promises'

const path = new URL('../examples/visualizer/scene.html', import.meta.url)
let source = await readFile(path, 'utf8')

const replacements = [
  ["  input('commands', /** @type {GameCommand[]} */ ([]))\n", ""],
  [`    let lastReset=this.resetToken\n    const keys=new Set()`, `    let lastReset=this.resetToken\n    const pendingActions={jump:0,mine:0,place:0,craft:0}\n    const queueCommand=event=>{\n      const action=event.detail?.action\n      if(action==='jump')pendingActions.jump++\n      if(action==='mine')pendingActions.mine++\n      if(action==='place')pendingActions.place++\n      if(action==='craft')pendingActions.craft++\n    }\n    host.addEventListener('game-command',queueCommand,{signal:abortSignal})\n    const keys=new Set()`],
  [`      if(event.code==='Space')this.commands.push('jump')\n      if(event.code==='KeyF')this.commands.push('mine')\n      if(event.code==='KeyG')this.commands.push('place')\n      if(event.code==='KeyC')this.commands.push('craft')`, `      if(event.code==='Space')pendingActions.jump++\n      if(event.code==='KeyF')pendingActions.mine++\n      if(event.code==='KeyG')pendingActions.place++\n      if(event.code==='KeyC')pendingActions.craft++`],
  [`        const command=this.commands.shift()\n        frame.jump=command==='jump'\n        frame.mine=command==='mine'\n        frame.place=command==='place'\n        frame.craft=command==='craft'`, `        frame.jump=pendingActions.jump>0\n        frame.mine=pendingActions.mine>0\n        frame.place=pendingActions.place>0\n        frame.craft=pendingActions.craft>0\n        if(frame.jump)pendingActions.jump--\n        if(frame.mine)pendingActions.mine--\n        if(frame.place)pendingActions.place--\n        if(frame.craft)pendingActions.craft--`]
]

for (const [from,to] of replacements) {
  if (!source.includes(from)) throw new Error(`event-buffer replacement marker not found: ${from.slice(0,80)}`)
  source = source.replace(from,to)
}

await writeFile(path, source)

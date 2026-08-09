import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const which = command => spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0];
const browserPath = [process.env.CHROME_BIN, which('chromium'), which('chromium-browser'), which('google-chrome'), which('google-chrome-stable')].filter(Boolean)[0];
if (!browserPath) throw new Error('Chrome/Chromium not found');

const componentPaths = [
  'workspace/app.html', 'workspace/shell.html', 'workspace/sidebar.html', 'workspace/topbar.html', 'workspace/overview.html', 'workspace/metrics.html',
  'ui/metric.html', 'ui/panel.html', 'ui/avatar.html', 'project/list.html', 'project/row.html', 'task/board.html', 'task/column.html', 'task/card.html',
  'team/strip.html', 'activity/feed.html', 'activity/item.html', 'detail/drawer.html'
];
const componentTags = [
  'workspace-app', 'workspace-shell', 'workspace-sidebar', 'workspace-topbar', 'workspace-overview', 'workspace-metrics',
  'ui-metric', 'ui-panel', 'project-list', 'project-row', 'task-board', 'task-column', 'task-card', 'team-strip', 'ui-avatar',
  'activity-feed', 'activity-item', 'detail-drawer'
];
const fixtures = Object.fromEntries(await Promise.all(componentPaths.map(async path => [path, await readFile(join(root, 'examples', path), 'utf8')])));
const minRuntime = await readFile(join(root, 'skein.min.js'), 'utf8');

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolvePort(port));
  });
});
const profile = await mkdtemp(join(tmpdir(), 'skein-workspace-'));
const browser = spawn(browserPath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const endpoint = `http://127.0.0.1:${port}`;

async function waitForTarget() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const tabs = await fetch(`${endpoint}/json`).then(response => response.json());
      const tab = tabs.find(target => target.type === 'page');
      if (tab) return tab;
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools Protocol did not become ready');
}

const target = await waitForTarget();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveSocket, reject) => { socket.onopen = resolveSocket; socket.onerror = reject; });
let requestId = 0;
const pending = new Map();
const exceptions = [];
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((resolveRequest, reject) => {
  const id = ++requestId;
  pending.set(id, { resolve: resolveRequest, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
await send('Runtime.enable');
await send('Page.enable');

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

try {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(40);
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  await send('Page.setDocumentContent', { frameId, html: '<!doctype html><html><head><base href="http://example.test/examples/"></head><body><workspace-app></workspace-app></body></html>' });
  await evaluate(`window.fetch=async url=>{const path=new URL(String(url)).pathname.replace(/^\\/examples\\//,'');const source=${JSON.stringify(fixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`);
  await evaluate(`(async()=>{const url=URL.createObjectURL(new Blob([${JSON.stringify(minRuntime)}],{type:'text/javascript'}));await import(url)})()`);

  let ready = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    await sleep(25);
    ready = await evaluate(`!!document.querySelector('workspace-app')?.shadowRoot?.querySelector('workspace-shell')?.shadowRoot?.querySelector('slot[name="sidebar"]')`);
    if (ready) break;
  }
  if (!ready) throw new Error(`Workspace did not mount: ${exceptions.join('\n')}`);

  const defined = await evaluate(`(${JSON.stringify(componentTags)}).filter(tag=>customElements.get(tag)).length`);
  if (defined !== componentTags.length) throw new Error(`Expected ${componentTags.length} component types, got ${defined}`);

  const slots = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const shell=app.shadowRoot.querySelector('workspace-shell');const root=shell.shadowRoot;return{sidebar:root.querySelector('slot[name="sidebar"]').assignedElements().map(e=>e.localName),topbar:root.querySelector('slot[name="topbar"]').assignedElements().map(e=>e.localName),main:root.querySelector('slot:not([name])').assignedElements().map(e=>e.localName),aside:root.querySelector('slot[name="aside"]').assignedElements().map(e=>e.localName)}})()`);
  if (slots.sidebar[0] !== 'workspace-sidebar' || slots.topbar[0] !== 'workspace-topbar' || slots.main[0] !== 'workspace-overview' || slots.aside[0] !== 'detail-drawer') throw new Error(`Native shell slots failed: ${JSON.stringify(slots)}`);

  const panelSlots = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const overview=app.shadowRoot.querySelector('workspace-overview');const panel=overview.shadowRoot.querySelector('ui-panel');const root=panel.shadowRoot;return{heading:root.querySelector('slot[name="heading"]').assignedElements().map(e=>e.textContent.trim()),body:root.querySelector('slot:not([name])').assignedElements().map(e=>e.localName)}})()`);
  if (panelSlots.heading[0] !== 'Projects' || panelSlots.body[0] !== 'project-list') throw new Error(`Native panel slots failed: ${JSON.stringify(panelSlots)}`);

  await evaluate(`Skein.define('input-attr-probe','<script>input("label","fallback");input("count",0);input("enabled",false)<\\/script><b>{label}/{count}/{enabled}</b>')`);
  const primitiveInputs = await evaluate(`(async()=>{const el=document.createElement('input-attr-probe');el.setAttribute('label','Static');el.setAttribute('count','12');el.setAttribute('enabled','');document.body.append(el);for(let i=0;i<100&&!el.shadowRoot.querySelector('b');i++)await new Promise(r=>setTimeout(r,0));const before={label:el.label,count:el.count,enabled:el.enabled,text:el.shadowRoot.querySelector('b')?.textContent};el.setAttribute('count','20');await Promise.resolve();const after=el.count;el.dispose();el.remove();return{before,after}})()`);
  if (primitiveInputs.before.label !== 'Static' || primitiveInputs.before.count !== 12 || primitiveInputs.before.enabled !== true || primitiveInputs.after !== 12) throw new Error(`Static primitive input attributes failed: ${JSON.stringify(primitiveInputs)}`);
  const propertyWins = await evaluate(`(async()=>{const el=document.createElement('input-attr-probe');el.setAttribute('label','attribute');el.label='property';document.body.append(el);for(let i=0;i<100&&!el.shadowRoot.querySelector('b');i++)await new Promise(r=>setTimeout(r,0));const value=el.label;el.dispose();el.remove();return value})()`);
  if (propertyWins !== 'property') throw new Error(`Pre-mount property did not override static attribute: ${propertyWins}`);

  const metricInputs = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const overview=app.shadowRoot.querySelector('workspace-overview');const metrics=overview.shadowRoot.querySelector('workspace-metrics');return[...metrics.shadowRoot.querySelectorAll('ui-metric')].map(item=>({name:item.name,tone:item.tone,value:item.value}))})()`);
  if (metricInputs[0].name !== 'Projects' || metricInputs[1].name !== 'Active' || metricInputs[1].tone !== 'lime' || metricInputs[2].tone !== 'amber') throw new Error(`Workspace static inputs failed: ${JSON.stringify(metricInputs)}`);

  await evaluate(`(()=>{const app=document.querySelector('workspace-app');const top=app.shadowRoot.querySelector('workspace-topbar');const input=top.shadowRoot.querySelector('input');input.value='offline';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await sleep(30);
  let state = await evaluate(`(()=>{const app=document.querySelector('workspace-app');return{query:app.state.query,visible:app.state.visibleTasks.length,only:app.state.visibleTasks[0]?.id}})()`);
  if (state.query !== 'offline' || state.visible !== 1 || state.only !== 'T-104') throw new Error(`Search reactivity failed: ${JSON.stringify(state)}`);

  await evaluate(`(()=>{const app=document.querySelector('workspace-app');const top=app.shadowRoot.querySelector('workspace-topbar');const input=top.shadowRoot.querySelector('input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await sleep(30);
  const clicked = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const overview=app.shadowRoot.querySelector('workspace-overview');const board=overview.shadowRoot.querySelector('task-board');for(const column of board.shadowRoot.querySelectorAll('task-column'))for(const card of column.shadowRoot.querySelectorAll('task-card')){if(card.task?.id==='T-101'){card.shadowRoot.querySelector('button')?.click();return true}}return false})()`);
  if (!clicked) throw new Error('Could not find task T-101');
  await sleep(30);
  state = await evaluate(`document.querySelector('workspace-app').state.selectedId`);
  if (state !== 'T-101') throw new Error(`Composed event did not reach owner state: ${state}`);

  const moved = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const drawer=app.shadowRoot.querySelector('detail-drawer');const button=[...drawer.shadowRoot.querySelectorAll('button')].find(item=>item.dataset.status==='review');if(!button)return false;button.click();return true})()`);
  if (!moved) throw new Error('Detail drawer review action missing');
  await sleep(40);
  state = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const task=app.state.tasks.find(item=>item.id==='T-101');return{status:task.status,activity:app.state.activity[0].text,review:app.state.tasks.filter(item=>item.status==='review').length}})()`);
  if (state.status !== 'review' || !state.activity.includes('Persist filter state') || state.review !== 3) throw new Error(`Cross-component mutation failed: ${JSON.stringify(state)}`);

  await evaluate(`document.querySelector('workspace-app').shadowRoot.querySelector('detail-drawer').shadowRoot.querySelector('header button').click()`);
  await sleep(30);
  state = await evaluate(`(()=>{const app=document.querySelector('workspace-app');const drawer=app.shadowRoot.querySelector('detail-drawer');return{selected:app.state.selectedId,section:!!drawer.shadowRoot.querySelector('section')}})()`);
  if (state.selected !== '' || state.section) throw new Error(`Conditional drawer teardown failed: ${JSON.stringify(state)}`);

  if (exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`);
  console.log(`workspace-scale: ${componentTags.length}/${componentTags.length} component types defined`);
  console.log('native-slots: passed');
  console.log('static-input-attributes: passed');
  console.log('property-precedence: passed');
  console.log('composed-events: passed');
  console.log('search-reactivity: passed');
  console.log('status-mutation: passed');
  console.log('conditional-drawer: passed');
} finally {
  socket.close();
  browser.kill('SIGTERM');
  await Promise.race([once(browser, 'exit'), sleep(1000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

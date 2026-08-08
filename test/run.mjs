import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const runNode = (file, args = []) => {
  const result = spawnSync(process.execPath, [join(root, file), ...args], { cwd: root, encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) process.exit(result.status || 1);
};

runNode('tools/build.mjs', ['--check']);
runNode('test/core-node.mjs');

const which = command => spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0];
const browserPath = [process.env.CHROME_BIN, which('chromium'), which('chromium-browser'), which('google-chrome'), which('google-chrome-stable')].filter(Boolean)[0];
if (!browserPath) throw new Error('Chrome/Chromium not found');

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolvePort(port));
  });
});

const profile = await mkdtemp(join(tmpdir(), 'skein-chrome-'));
const browser = spawn(browserPath, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
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

async function connect() {
  const tab = await waitForTarget();
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
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
  await new Promise((resolveSocket, reject) => { socket.onopen = resolveSocket; socket.onerror = reject; });
  const send = (method, params = {}) => new Promise((resolveRequest, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve: resolveRequest, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  return { socket, send, exceptions };
}

async function newDocument(send, body = '') {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(40);
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  await send('Page.setDocumentContent', { frameId, html: `<!doctype html><html><head><base href="http://example.test/"></head><body>${body}</body></html>` });
}

async function evaluate(send, expression, options = {}) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, ...options });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

const modules = {
  reactive: await readFile(join(root, 'runtime/reactive.js'), 'utf8'),
  template: await readFile(join(root, 'runtime/template.js'), 'utf8'),
  component: await readFile(join(root, 'runtime/component.js'), 'utf8'),
  entry: await readFile(join(root, 'skein.js'), 'utf8'),
};
const minRuntime = await readFile(join(root, 'skein.min.js'), 'utf8');
const studioFixtures = Object.fromEntries(await Promise.all([
  'studio/app.html','studio/transport.html','studio/sequencer.html','studio/mixer.html','studio/scope.html','pocket/synth.html'
].map(async path => [path, await readFile(join(root, 'examples', path), 'utf8')])));

async function loadReadable(send) {
  const expression = `(async()=>{const r=URL.createObjectURL(new Blob([${JSON.stringify(modules.reactive)}],{type:'text/javascript'}));const t=URL.createObjectURL(new Blob([${JSON.stringify(modules.template)}.replace('./reactive.js',r)],{type:'text/javascript'}));const c=URL.createObjectURL(new Blob([${JSON.stringify(modules.component)}.replace('./reactive.js',r).replace('./template.js',t)],{type:'text/javascript'}));const e=URL.createObjectURL(new Blob([${JSON.stringify(modules.entry)}.replace('./runtime/component.js',c)],{type:'text/javascript'}));await import(e)})()`;
  await evaluate(send, expression, { awaitPromise: true });
}

async function loadMin(send, afterImport = '') {
  const expression = `(async()=>{const u=URL.createObjectURL(new Blob([${JSON.stringify(minRuntime)}],{type:'text/javascript'}));const {Skein}=await import(u);${afterImport};return Skein.version})()`;
  return evaluate(send, expression, { awaitPromise: true });
}

const runtimeFixture = await readFile(join(root, 'test/runtime.html'), 'utf8');
const testIndex = await readFile(join(root, 'test/index.html'), 'utf8');
const marker = '<script id="browser-tests">';
const harness = testIndex.slice(testIndex.indexOf(marker) + marker.length, testIndex.lastIndexOf('</script>'));
const { socket, send, exceptions } = await connect();

try {
  await newDocument(send, '<third-party-box></third-party-box><test-runtime></test-runtime><inline-boot></inline-boot><template skein="inline-boot"><script>this.word="woven"</script><b id="boot-word">{word}</b></template><pre id="results">Running…</pre>');
  await evaluate(send, `window.fetch=async url=>String(url).endsWith('test/runtime.html')?new Response(${JSON.stringify(runtimeFixture)},{status:200}):new Response('',{status:404})`);
  await loadReadable(send);
  await evaluate(send, `Skein.define('row-life','<script>onCleanup(()=>window.__rowDisposals=(window.__rowDisposals||0)+1)<\\/script><i>life</i>')`);
  await evaluate(send, harness);

  let result = {};
  for (let attempt = 0; attempt < 400; attempt++) {
    await sleep(25);
    result = await evaluate(send, `({status:document.body.dataset.tests,failed:document.body.dataset.failed,text:document.querySelector('#results')?.textContent,benchmark:window.__benchmark})`);
    if (result.status) break;
  }
  console.log(result.text || 'Browser tests did not finish');
  if (result.benchmark) {
    console.log('\nperformance smoke (Chrome, ms):');
    for (const [name, value] of Object.entries(result.benchmark)) console.log(`  ${name}: ${value.toFixed(2)}`);
  }
  if (result.status !== 'passed') throw new Error(`${result.failed || '?'} browser tests failed`);

  await newDocument(send, '<prod-test></prod-test>');
  await evaluate(send, `window.fetch=async()=>new Response('',{status:404});window.__canvasOk=false`);
  await loadMin(send, `Skein.define('prod-test','<script>this.count=1;this.rows=[{id:1,n:"A"},{id:2,n:"B"}];this.show=true;this.double=computed(()=>this.count*2);this.up=()=>this.count++;queueMicrotask(()=>{window.__canvasOk=!!host.shadowRoot.querySelector("canvas").getContext("2d")})<\\/script><style>:host{display:block}b{font-weight:700}</style><button id="up" @click={up}>{count}/{double}</button><i each={rows} key={id} data-id={id}>{n}</i><em if={show}>yes</em><svg><circle id="dot" cx={count} cy="5" r="2"></circle></svg><canvas></canvas>')`);
  let prod;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    prod = await evaluate(send, `(()=>{const root=document.querySelector('prod-test')?.shadowRoot;return{text:root?.querySelector('#up')?.textContent,rows:root?.querySelectorAll('i').length,style:root?.querySelector('style')?.textContent,cx:root?.querySelector('#dot')?.getAttribute('cx'),canvas:window.__canvasOk,api:Object.keys(Skein).sort().join(','),dispose:typeof document.querySelector('prod-test')?.dispose}})()`);
    if (prod.text && prod.canvas) break;
  }
  if (prod.text !== '1/2' || prod.rows !== 2 || !prod.style?.includes('font-weight:700') || prod.cx !== '1' || !prod.canvas || prod.api !== 'define,version' || prod.dispose !== 'function') throw new Error(`Production runtime smoke failed: ${JSON.stringify(prod)}`);
  await evaluate(send, `document.querySelector('prod-test').shadowRoot.querySelector('#up').click()`);
  await sleep(20);
  prod = await evaluate(send, `({text:document.querySelector('prod-test').shadowRoot.querySelector('#up').textContent,cx:document.querySelector('prod-test').shadowRoot.querySelector('#dot').getAttribute('cx')})`);
  if (prod.text !== '2/4' || prod.cx !== '2') throw new Error(`Production update failed: ${JSON.stringify(prod)}`);
  console.log('min-runtime: passed');

  await newDocument(send);
  await evaluate(send, `window.fetch=async()=>new Response('',{status:404})`);
  await loadMin(send, `Skein.define('prod-input-child','<script>input("value",0);this.raise=()=>host.dispatchEvent(new CustomEvent("value-change",{detail:{value:Number(this.value)+1},bubbles:true,composed:true}))<\\/script><button id="raise" @click={raise}>{value}</button>');Skein.define('prod-input-parent','<script>this.value=7;this.changed=e=>this.value=e.detail.value<\\/script><prod-input-child id="child" .value={value} @value-change={changed}></prod-input-child><b id="parent">{value}</b>');document.body.append(document.createElement('prod-input-parent'))`);
  let contract;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    contract = await evaluate(send, `(()=>{const p=document.querySelector('prod-input-parent'),c=p?.shadowRoot?.querySelector('#child');return{parent:p?.shadowRoot?.querySelector('#parent')?.textContent,child:c?.shadowRoot?.querySelector('#raise')?.textContent}})()`);
    if (contract.child) break;
  }
  if (contract.parent !== '7' || contract.child !== '7') throw new Error(`Production input mount failed: ${JSON.stringify(contract)}`);
  await evaluate(send, `document.querySelector('prod-input-parent').shadowRoot.querySelector('#child').shadowRoot.querySelector('#raise').click()`);
  await sleep(20);
  contract = await evaluate(send, `(()=>{const p=document.querySelector('prod-input-parent'),c=p.shadowRoot.querySelector('#child');return{parent:p.shadowRoot.querySelector('#parent').textContent,child:c.shadowRoot.querySelector('#raise').textContent}})()`);
  if (contract.parent !== '8' || contract.child !== '8') throw new Error(`Production composition failed: ${JSON.stringify(contract)}`);
  console.log('min-composition: passed');

  await newDocument(send, '<studio-app></studio-app>');
  await evaluate(send, `window.fetch=async url=>{const path=new URL(String(url)).pathname.slice(1);const source=${JSON.stringify(studioFixtures)}[path];return source===undefined?new Response('',{status:404}):new Response(source,{status:200})}`);
  await loadMin(send);
  let studio;
  for (let attempt = 0; attempt < 150; attempt++) {
    await sleep(20);
    studio = await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),root=app?.shadowRoot,synth=root?.querySelector('pocket-synth'),mixer=root?.querySelector('studio-mixer');return{ready:!!mixer?.shadowRoot?.querySelector('input'),wave:synth?.wave,volume:synth?.volume}})()`);
    if (studio.ready) break;
  }
  if (!studio.ready || studio.wave !== 'sawtooth' || studio.volume !== .18) throw new Error(`Studio mount failed: ${JSON.stringify(studio)}`);
  await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),mixer=app.shadowRoot.querySelector('studio-mixer'),input=mixer.shadowRoot.querySelector('input');input.value='.31';input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await sleep(30);
  studio = await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),root=app.shadowRoot;return{app:app.state.volume,synth:root.querySelector('pocket-synth').volume,mixer:root.querySelector('studio-mixer').volume}})()`);
  if (studio.app !== .31 || studio.synth !== .31 || studio.mixer !== .31) throw new Error(`Studio mixer propagation failed: ${JSON.stringify(studio)}`);
  await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),transport=app.shadowRoot.querySelector('studio-transport');transport.shadowRoot.querySelector('button').click()})()`);
  await sleep(40);
  studio = await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),transport=app.shadowRoot.querySelector('studio-transport');return{app:app.state.playing,child:transport.playing}})()`);
  if (studio.app !== true || studio.child !== true) throw new Error(`Studio transport propagation failed: ${JSON.stringify(studio)}`);
  await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),synth=app.shadowRoot.querySelector('pocket-synth');synth.dispatchEvent(new CustomEvent('note',{detail:{note:'C',velocity:.2},bubbles:true,composed:true}))})()`);
  await sleep(20);
  studio = await evaluate(send, `(()=>{const app=document.querySelector('studio-app'),scope=app.shadowRoot.querySelector('studio-scope');return{note:app.state.note,level:app.state.level,scopeNote:scope.note,scopeLevel:scope.level}})()`);
  if (studio.note !== 'C' || studio.scopeNote !== 'C' || studio.level !== .2 || studio.scopeLevel !== .2) throw new Error(`Studio event propagation failed: ${JSON.stringify(studio)}`);
  console.log('studio-composition: passed');

  await newDocument(send);
  await evaluate(send, `window.fetch=async()=>new Response('',{status:404})`);
  await loadMin(send, `Skein.define('late-parent','<late-child></late-child>');document.body.append(document.createElement('late-parent'))`);
  await sleep(40);
  const claimed = await evaluate(send, `!!customElements.get('late-child')`);
  if (claimed) throw new Error('Missing nested source was claimed before define');
  await evaluate(send, `Skein.define('late-child','<b id="late">ready</b>')`);
  let late;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    late = await evaluate(send, `document.querySelector('late-parent')?.shadowRoot?.querySelector('late-child')?.shadowRoot?.querySelector('#late')?.textContent`);
    if (late) break;
  }
  if (late !== 'ready') throw new Error(`Late define failed: ${late}`);
  console.log('late-define: passed');

  if (exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`);
} finally {
  socket.close();
  browser.kill('SIGTERM');
  await Promise.race([once(browser, 'exit'), sleep(1000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

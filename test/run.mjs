import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

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
  const server = createNetServer();
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

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
]);
const siteServer = createHttpServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/playground' || pathname === '/playground/' ? 'playground/index.html'
      : pathname === '/examples' || pathname === '/examples/' ? 'examples/index.html'
      : pathname.slice(1);
    const allowed = relative === 'skein.min.js' || ['examples/', 'playground/', 'site/'].some(prefix => relative.startsWith(prefix));
    if (!allowed || relative.includes('..')) throw new Error('Not found');
    const body = await readFile(join(root, relative));
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': contentTypes.get(extname(relative)) || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});
await new Promise((resolveServer, reject) => {
  siteServer.once('error', reject);
  siteServer.listen(0, '127.0.0.1', resolveServer);
});
const siteOrigin = `http://127.0.0.1:${siteServer.address().port}`;

try {
  await newDocument(send, '<third-party-box></third-party-box><test-runtime></test-runtime><inline-boot></inline-boot><template skein="inline-boot"><script>this.word="woven"</script><b id="boot-word">{word}</b></template><pre id="results">Running…</pre>');
  await evaluate(send, `window.fetch=async url=>String(url).endsWith('test/runtime.html')?new Response(${JSON.stringify(runtimeFixture)},{status:200}):new Response('',{status:404})`);
  await loadReadable(send);
  await evaluate(send, `Skein.define('row-life','<script>onCleanup(()=>window.__rowDisposals=(window.__rowDisposals||0)+1)<\\/script><i>life</i>');Skein.define('css-shadow-child','<span id="inherited">inherited</span><style>#inherited{color:var(--tone)}</style>')`);
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

  await newDocument(send, '<prod-css-properties></prod-css-properties>');
  await evaluate(send, `window.fetch=async()=>new Response('',{status:404})`);
  await loadMin(send, `Skein.define('prod-css-child','<span id="inherited">inherited</span><style>#inherited{color:var(--tone)}</style>');Skein.define('prod-css-properties','<script>this.size=7;this.zero=0;this.tone="rgb(7, 8, 9)";this.nullable="null-live";this.undefinable="undefined-live";this.falsy="false-live";this.initialNull=null;this.initialUndefined=undefined;this.initialFalse=false<\/script><div id="target" style="display:block;--static-token:fixed" --size={size} --zero={zero} --tone={tone} --nullable={nullable} --undefinable={undefinable} --falsy={falsy} --initial-null={initialNull} --initial-undefined={initialUndefined} --initial-false={initialFalse}></div><prod-css-child id="child" style="display:block;--child-static:fixed" --tone={tone}></prod-css-child><style>#target{width:calc(var(--size) * 1px);color:var(--tone)}</style>')`);
  let cssProperties;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    cssProperties = await evaluate(send, `(()=>{const root=document.querySelector('prod-css-properties')?.shadowRoot,node=root?.querySelector('#target'),child=root?.querySelector('#child'),inherited=child?.shadowRoot?.querySelector('#inherited');if(!node||!inherited)return null;const style=getComputedStyle(node);return{size:node.style.getPropertyValue('--size'),zero:node.style.getPropertyValue('--zero'),tone:node.style.getPropertyValue('--tone'),nullable:node.style.getPropertyValue('--nullable'),undefinable:node.style.getPropertyValue('--undefinable'),falsy:node.style.getPropertyValue('--falsy'),initialNull:node.style.getPropertyValue('--initial-null'),initialUndefined:node.style.getPropertyValue('--initial-undefined'),initialFalse:node.style.getPropertyValue('--initial-false'),bindingAttribute:node.getAttribute('--size'),display:node.style.display,staticToken:node.style.getPropertyValue('--static-token'),width:style.width,color:style.color,childDisplay:child.style.display,childStatic:child.style.getPropertyValue('--child-static'),inheritedColor:getComputedStyle(inherited).color}})()`);
    if (cssProperties) break;
  }
  if (cssProperties?.size !== '7' || cssProperties.zero !== '0' || cssProperties.tone !== 'rgb(7, 8, 9)' || cssProperties.nullable !== 'null-live' || cssProperties.undefinable !== 'undefined-live' || cssProperties.falsy !== 'false-live' || cssProperties.initialNull !== '' || cssProperties.initialUndefined !== '' || cssProperties.initialFalse !== '' || cssProperties.bindingAttribute !== null || cssProperties.display !== 'block' || cssProperties.staticToken !== 'fixed' || cssProperties.width !== '7px' || cssProperties.color !== 'rgb(7, 8, 9)' || cssProperties.childDisplay !== 'block' || cssProperties.childStatic !== 'fixed' || cssProperties.inheritedColor !== 'rgb(7, 8, 9)') throw new Error(`Minified CSS property mount failed: ${JSON.stringify(cssProperties)}`);

  cssProperties = await evaluate(send, `(async()=>{const host=document.querySelector('prod-css-properties'),node=host.shadowRoot.querySelector('#target'),child=host.shadowRoot.querySelector('#child'),inherited=child.shadowRoot.querySelector('#inherited'),writes=[],removals=[],styleAttributes=[];const setProperty=CSSStyleDeclaration.prototype.setProperty,removeProperty=CSSStyleDeclaration.prototype.removeProperty,setAttribute=Element.prototype.setAttribute;CSSStyleDeclaration.prototype.setProperty=function(name,value,priority){if(this===node.style)writes.push([name,String(value)]);return setProperty.call(this,name,value,priority)};CSSStyleDeclaration.prototype.removeProperty=function(name){if(this===node.style)removals.push(name);return removeProperty.call(this,name)};Element.prototype.setAttribute=function(name,value){if(this===node&&name==='style')styleAttributes.push(String(value));return setAttribute.call(this,name,value)};try{host.state.size=19;host.state.tone='rgb(10, 11, 12)';host.state.nullable=null;host.state.undefinable=undefined;host.state.falsy=false;await Promise.resolve();await Promise.resolve();const style=getComputedStyle(node);return{size:node.style.getPropertyValue('--size'),tone:node.style.getPropertyValue('--tone'),nullable:node.style.getPropertyValue('--nullable'),undefinable:node.style.getPropertyValue('--undefinable'),falsy:node.style.getPropertyValue('--falsy'),display:node.style.display,staticToken:node.style.getPropertyValue('--static-token'),width:style.width,color:style.color,childDisplay:child.style.display,childStatic:child.style.getPropertyValue('--child-static'),inheritedColor:getComputedStyle(inherited).color,writes,removals,styleAttributes}}finally{CSSStyleDeclaration.prototype.setProperty=setProperty;CSSStyleDeclaration.prototype.removeProperty=removeProperty;Element.prototype.setAttribute=setAttribute}})()`, { awaitPromise: true });
  const wroteSize = cssProperties.writes.some(([name, value]) => name === '--size' && value === '19');
  const wroteTone = cssProperties.writes.some(([name, value]) => name === '--tone' && value === 'rgb(10, 11, 12)');
  const removedValues = ['--nullable', '--undefinable', '--falsy'].every(name => cssProperties.removals.includes(name) && cssProperties[name.slice(2)] === '');
  if (cssProperties.size !== '19' || cssProperties.tone !== 'rgb(10, 11, 12)' || !wroteSize || !wroteTone || !removedValues || cssProperties.styleAttributes.length || cssProperties.display !== 'block' || cssProperties.staticToken !== 'fixed' || cssProperties.width !== '19px' || cssProperties.color !== 'rgb(10, 11, 12)' || cssProperties.childDisplay !== 'block' || cssProperties.childStatic !== 'fixed' || cssProperties.inheritedColor !== 'rgb(10, 11, 12)') throw new Error(`Minified CSS property update failed: ${JSON.stringify(cssProperties)}`);
  console.log('min-css-properties: passed');

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

  const audioHarness = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{
    const calls=globalThis.__audioCalls=[];
    class FakeOscillator extends EventTarget {
      constructor(){super();this.frequency={value:0};this.type='sine'}
      connect(node){calls.push('oscillator-connect');return node}
      disconnect(){calls.push('oscillator-disconnect')}
      start(){calls.push('oscillator-start')}
      stop(){calls.push('oscillator-stop');setTimeout(()=>this.dispatchEvent(new Event('ended')),0)}
    }
    class FakeGain {
      constructor(){this.gain={value:.1,setValueAtTime(value){this.value=value},exponentialRampToValueAtTime(value){this.value=value},cancelScheduledValues(){}}}
      connect(node){calls.push('gain-connect');return node}
      disconnect(){calls.push('gain-disconnect')}
    }
    class FakeAudioContext extends EventTarget {
      constructor(options={}){super();this.state='suspended';this.currentTime=1;this.destination={};calls.push('context:'+String(options.latencyHint||''));globalThis.__audioContext=this}
      resume(){
        calls.push('resume:'+String(navigator.userActivation.isActive));
        return new Promise(resolve=>setTimeout(()=>{this.state='running';calls.push('resumed');this.dispatchEvent(new Event('statechange'));resolve()},35))
      }
      createOscillator(){calls.push('create-oscillator');return new FakeOscillator()}
      createGain(){calls.push('create-gain');return new FakeGain()}
      close(){this.state='closed';calls.push('close');this.dispatchEvent(new Event('statechange'));return Promise.resolve()}
    }
    Object.defineProperty(globalThis,'AudioContext',{configurable:true,writable:true,value:FakeAudioContext});
    Object.defineProperty(globalThis,'webkitAudioContext',{configurable:true,writable:true,value:FakeAudioContext});
  })()` });
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${siteOrigin}/examples/` });

    let galleryStudio;
    for (let attempt = 0; attempt < 300; attempt++) {
      await sleep(25);
      try {
        galleryStudio = await evaluate(send, `(()=>{
          const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
          const app=frame?.contentDocument?.querySelector('studio-app');
          const root=app?.shadowRoot;
          const synth=root?.querySelector('pocket-synth');
          const key=synth?.shadowRoot?.querySelector('.keys button');
          const featured=[...document.querySelectorAll('.demo-card--featured')].map(node=>node.querySelector('iframe')?.title);
          return {ready:!!key,allow:frame?.getAttribute('allow'),frameClass:frame?.className,featured,overflow:frame?.contentWindow?.getComputedStyle(frame.contentDocument.body).overflowY};
        })()`);
      } catch {}
      if (galleryStudio?.ready) break;
    }
    if (!galleryStudio?.ready || galleryStudio.allow !== 'autoplay *' || !galleryStudio.frameClass.includes('demo-frame--studio') || galleryStudio.featured.join(',') !== 'Workspace,Skein Studio' || galleryStudio.overflow !== 'auto') {
      throw new Error(`Gallery Studio frame failed: ${JSON.stringify(galleryStudio)}`);
    }

    const point = await evaluate(send, `(()=>{
      const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
      frame.scrollIntoView({block:'center',behavior:'instant'});
      const key=frame.contentDocument.querySelector('studio-app').shadowRoot.querySelector('pocket-synth').shadowRoot.querySelector('.keys button');
      key.scrollIntoView({block:'center',behavior:'instant'});
      const frameBox=frame.getBoundingClientRect(),keyBox=key.getBoundingClientRect();
      return {x:frameBox.left+keyBox.left+keyBox.width/2,y:frameBox.top+keyBox.top+keyBox.height/2,visible:keyBox.top>=0&&keyBox.bottom<=frame.contentWindow.innerHeight};
    })()`);
    if (!point.visible || point.x < 0 || point.x > 1200 || point.y < 0 || point.y > 800) throw new Error(`Studio key is not reachable in its demo frame: ${JSON.stringify(point)}`);

    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(10);
    const beforeResume = await evaluate(send, `(()=>{const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');return frame.contentWindow.__audioCalls})()`);
    if (!beforeResume.includes('resume:true') || beforeResume.includes('oscillator-start')) throw new Error(`Audio did not wait for activated resume: ${JSON.stringify(beforeResume)}`);

    await sleep(100);
    const quickTap = await evaluate(send, `(()=>{
      const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
      const app=frame.contentDocument.querySelector('studio-app'),synth=app.shadowRoot.querySelector('pocket-synth');
      return {calls:frame.contentWindow.__audioCalls,note:app.state.note,active:synth.state.notes[0].active,state:synth.state.audioState};
    })()`);
    const resumeIndex = quickTap.calls.indexOf('resumed');
    const startIndex = quickTap.calls.indexOf('oscillator-start');
    const stopIndex = quickTap.calls.indexOf('oscillator-stop');
    if (resumeIndex < 0 || startIndex <= resumeIndex || stopIndex <= startIndex || quickTap.note !== 'C' || quickTap.active || quickTap.state !== 'audio on') {
      throw new Error(`Quick first tap audio contract failed: ${JSON.stringify(quickTap)}`);
    }

    const activationStarts = quickTap.calls.filter(value => value === 'oscillator-start').length;
    const activationStops = quickTap.calls.filter(value => value === 'oscillator-stop').length;
    await evaluate(send, `(()=>{
      const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
      frame.contentDocument.querySelector('studio-app').shadowRoot.querySelector('pocket-synth').shadowRoot.querySelector('.keys button').click();
    })()`);
    await sleep(60);
    const nativeActivation = await evaluate(send, `(()=>{
      const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
      const synth=frame.contentDocument.querySelector('studio-app').shadowRoot.querySelector('pocket-synth');
      return {calls:frame.contentWindow.__audioCalls,active:synth.state.notes[0].active};
    })()`);
    if (nativeActivation.calls.filter(value => value === 'oscillator-start').length !== activationStarts + 1 || nativeActivation.calls.filter(value => value === 'oscillator-stop').length !== activationStops + 1 || nativeActivation.active) {
      throw new Error(`Native button activation audio contract failed: ${JSON.stringify(nativeActivation)}`);
    }

    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(20);
    const heldNote = await evaluate(send, `(()=>{
      const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
      const app=frame.contentDocument.querySelector('studio-app'),synth=app.shadowRoot.querySelector('pocket-synth');
      return {active:synth.state.notes[0].active,stops:frame.contentWindow.__audioCalls.filter(value=>value==='oscillator-stop').length};
    })()`);
    if (!heldNote.active) throw new Error(`Held Studio note did not start: ${JSON.stringify(heldNote)}`);

    await evaluate(send, `(()=>{
      const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');
      frame.contentDocument.querySelector('studio-app').dispose();
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(20);
    const cleanup = await evaluate(send, `(()=>{const frame=[...document.querySelectorAll('iframe')].find(node=>node.title==='Skein Studio');return frame.contentWindow.__audioCalls})()`);
    const cleanupStops = cleanup.filter(value=>value==='oscillator-stop').length;
    if (!cleanup.includes('close') || cleanupStops <= heldNote.stops || !cleanup.includes('oscillator-disconnect') || !cleanup.includes('gain-disconnect')) throw new Error(`Studio audio cleanup failed: ${JSON.stringify(cleanup)}`);
    console.log('studio-gallery-audio: passed');
  } finally {
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: audioHarness.identifier });
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${siteOrigin}/playground/` });
  await sleep(40);

  let playground;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      playground = await evaluate(send, `(()=>{const source=document.querySelector('#source'),preview=document.querySelector('#preview'),numbers=document.querySelector('#line-numbers code');return{example:document.querySelector('#example')?.value,state:document.querySelector('#state')?.dataset.state,draft:document.querySelector('#draft-state')?.dataset.state,sandbox:preview?.getAttribute('sandbox'),sameOrigin:preview?.sandbox.contains('allow-same-origin'),source:source?.value,lineCount:source?.value.split('\\n').length,gutterCount:numbers?.textContent.split('\\n').length}})()`);
    } catch {}
    if (playground?.state === 'live') break;
    await sleep(25);
  }
  if (playground?.example !== 'counter' || playground.state !== 'live' || playground.draft !== 'original' || playground.sandbox !== 'allow-scripts' || playground.sameOrigin || !playground.source?.includes('this.count = 0') || playground.gutterCount !== playground.lineCount) {
    throw new Error(`Playground initial state failed: ${JSON.stringify(playground)}`);
  }

  const sandboxSource = `<script>
  let dom = 'allowed'
  let storage = 'allowed'
  try { parent.document.body.dataset.sandboxEscape = 'yes' } catch (error) { dom = error.name }
  try { parent.localStorage.setItem('skein.sandbox.escape', 'yes') } catch (error) { storage = error.name }
  parent.postMessage({ type: 'skein-error', message: 'stale sandbox error', runId: -1 }, '*')
  parent.postMessage({ type: 'sandbox-probe', dom, storage }, '*')
</script>
<p>Sandbox probe</p>`;

  let editor = await evaluate(send, `(()=>{const source=document.querySelector('#source'),auto=document.querySelector('#autorun'),preview=document.querySelector('#preview');window.__playgroundOriginal=source.value;window.__sandboxProbe=null;addEventListener('message',event=>{if(event.source===preview.contentWindow&&event.data?.type==='sandbox-probe')window.__sandboxProbe=event.data});auto.checked=false;auto.dispatchEvent(new Event('change',{bubbles:true}));source.value=${JSON.stringify(sandboxSource)};source.setSelectionRange(source.value.length,source.value.length);source.dispatchEvent(new Event('input',{bubbles:true}));const lines=source.value.split('\\n').length;return{lines,label:document.querySelector('#lines').textContent,gutter:document.querySelector('#line-numbers code').textContent.split('\\n').length,cursor:document.querySelector('#cursor-status').textContent,draft:document.querySelector('#draft-state').dataset.state,state:document.querySelector('#state').dataset.state,highlighted:!!document.querySelector('#highlight code .tok-keyword')}})()`);
  if (editor.lines !== editor.gutter || editor.label !== `${editor.lines} lines` || !editor.cursor.startsWith(`Ln ${editor.lines}, Col `) || editor.draft !== 'edited' || editor.state !== 'manual' || !editor.highlighted) {
    throw new Error(`Playground editor paint failed: ${JSON.stringify(editor)}`);
  }

  await sleep(650);
  let draft = await evaluate(send, `(()=>{const source=document.querySelector('#source');return{stored:localStorage.getItem('skein.playground.draft.counter'),value:source.value,state:document.querySelector('#draft-state').dataset.state}})()`);
  if (draft.stored !== draft.value || draft.state !== 'saved') throw new Error(`Playground draft autosave failed: ${JSON.stringify(draft)}`);

  draft = await evaluate(send, `(()=>{const source=document.querySelector('#source');source.value+='\\n<!-- immediate save -->';source.setSelectionRange(source.value.length,source.value.length);source.dispatchEvent(new Event('input',{bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));return{stored:localStorage.getItem('skein.playground.draft.counter'),value:source.value,state:document.querySelector('#draft-state').dataset.state}})()`);
  if (draft.stored !== draft.value || draft.state !== 'saved') throw new Error(`Playground keyboard save failed: ${JSON.stringify(draft)}`);

  await evaluate(send, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}))`);
  let sandbox;
  for (let attempt = 0; attempt < 200; attempt++) {
    await sleep(25);
    sandbox = await evaluate(send, `({probe:window.__sandboxProbe,state:document.querySelector('#state').dataset.state,errorHidden:document.querySelector('#error').hidden,parentTouched:document.body.dataset.sandboxEscape||null,storageTouched:localStorage.getItem('skein.sandbox.escape')})`);
    if (sandbox.probe && sandbox.state === 'live') break;
  }
  if (!sandbox?.probe || sandbox.probe.dom === 'allowed' || sandbox.probe.storage === 'allowed' || sandbox.parentTouched || sandbox.storageTouched || !sandbox.errorHidden || sandbox.state !== 'live') {
    throw new Error(`Playground sandbox isolation failed: ${JSON.stringify(sandbox)}`);
  }

  const errorSource = `<script>send('skein-error', 'Expected preview error')</script>\n<p>Error probe</p>`;
  await evaluate(send, `(()=>{const source=document.querySelector('#source');source.value=${JSON.stringify(errorSource)};source.dispatchEvent(new Event('input',{bubbles:true}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}))})()`);
  let previewError;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    previewError = await evaluate(send, `({state:document.querySelector('#state').dataset.state,hidden:document.querySelector('#error').hidden,message:document.querySelector('#error-message').textContent})`);
    if (previewError.state === 'error') break;
  }
  await sleep(80);
  previewError = await evaluate(send, `({state:document.querySelector('#state').dataset.state,hidden:document.querySelector('#error').hidden,message:document.querySelector('#error-message').textContent})`);
  if (previewError.state !== 'error' || previewError.hidden || !previewError.message.includes('Expected preview error')) throw new Error(`Playground error state failed: ${JSON.stringify(previewError)}`);
  const dismissed = await evaluate(send, `(()=>{document.querySelector('#dismiss-error').click();return document.querySelector('#error').hidden})()`);
  if (!dismissed) throw new Error('Playground error dismissal failed');

  const reset = await evaluate(send, `(()=>{window.confirm=()=>true;document.querySelector('#reset').click();const source=document.querySelector('#source');return{original:source.value===window.__playgroundOriginal,stored:localStorage.getItem('skein.playground.draft.counter'),draft:document.querySelector('#draft-state').dataset.state,state:document.querySelector('#state').dataset.state}})()`);
  if (!reset.original || reset.stored !== null || reset.draft !== 'original' || reset.state !== 'manual') throw new Error(`Playground reset failed: ${JSON.stringify(reset)}`);

  const split = await evaluate(send, `(()=>{const splitter=document.querySelector('#splitter'),before=Number(splitter.getAttribute('aria-valuenow'));splitter.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));return{before,after:Number(splitter.getAttribute('aria-valuenow')),stored:Number(localStorage.getItem('skein.playground.editorRatio')),text:splitter.getAttribute('aria-valuetext')}})()`);
  if (!(split.after > split.before) || !(split.stored > split.before / 100) || split.text !== `Editor ${split.after} percent`) throw new Error(`Playground keyboard splitter failed: ${JSON.stringify(split)}`);

  await evaluate(send, `(()=>{window.__copiedShare='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedShare=value}}});document.querySelector('#share').click()})()`);
  let share;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    share = await evaluate(send, `(()=>{if(!window.__copiedShare)return null;const source=document.querySelector('#source').value,url=new URL(window.__copiedShare),binary=atob(url.hash.slice(6)),decoded=new TextDecoder().decode(Uint8Array.from(binary,char=>char.charCodeAt(0)));return{example:url.searchParams.get('example'),decoded,matches:decoded===source,label:document.querySelector('#share').textContent}})()`);
    if (share) break;
  }
  if (share?.example !== 'counter' || !share.matches || !share.label.includes('Copied')) throw new Error(`Playground share link failed: ${JSON.stringify(share)}`);

  console.log('playground-dx: passed');
  console.log('playground-sandbox: passed');

  if (exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`);
} finally {
  socket.close();
  browser.kill('SIGTERM');
  await Promise.race([once(browser, 'exit'), sleep(1000)]);
  siteServer.closeAllConnections?.();
  await new Promise(resolveServer => siteServer.close(resolveServer));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

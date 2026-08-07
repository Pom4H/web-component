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
const browserPath = [
  process.env.CHROME_BIN,
  which('chromium'),
  which('chromium-browser'),
  which('google-chrome'),
  which('google-chrome-stable'),
  process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
].filter(Boolean)[0];

if (!browserPath) {
  console.error('Chrome/Chromium not found. Set CHROME_BIN to run browser tests.');
  process.exit(1);
}

const port = await new Promise((resolvePort, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolvePort(port));
  });
});

const profile = await mkdtemp(join(tmpdir(), 'skein-chrome-'));
const browser = spawn(browserPath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

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
      const { resolve: resolveRequest, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolveRequest(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
  };

  await new Promise((resolveSocket, reject) => {
    socket.onopen = resolveSocket;
    socket.onerror = reject;
  });

  const send = (method, params = {}) => new Promise((resolveRequest, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve: resolveRequest, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  return { socket, send, exceptions };
}

async function newDocument(send, body) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(40);
  const frameId = (await send('Page.getFrameTree')).frameTree.frame.id;
  await send('Page.setDocumentContent', {
    frameId,
    html: `<!doctype html><html><head><base href="http://example.test/"></head><body>${body}</body></html>`,
  });
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

async function loadReadable(send) {
  const expression = `(async () => {
    const reactiveURL = URL.createObjectURL(new Blob([${JSON.stringify(modules.reactive)}], { type: 'text/javascript' }));
    const templateURL = URL.createObjectURL(new Blob([${JSON.stringify(modules.template)}.replace('./reactive.js', reactiveURL)], { type: 'text/javascript' }));
    const componentURL = URL.createObjectURL(new Blob([${JSON.stringify(modules.component)}.replace('./reactive.js', reactiveURL).replace('./template.js', templateURL)], { type: 'text/javascript' }));
    const entryURL = URL.createObjectURL(new Blob([${JSON.stringify(modules.entry)}.replace('./runtime/component.js', componentURL)], { type: 'text/javascript' }));
    await import(entryURL);
  })()`;
  await evaluate(send, expression, { awaitPromise: true });
}

async function loadMin(send, afterImport = '') {
  const expression = `(async () => {
    const runtimeURL = URL.createObjectURL(new Blob([${JSON.stringify(minRuntime)}], { type: 'text/javascript' }));
    const module = await import(runtimeURL);
    ${afterImport}
    return module.Skein.version;
  })()`;
  return evaluate(send, expression, { awaitPromise: true });
}

const safeScriptValue = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const playgroundSrcdoc = (componentSource, runtimeSource) => {
  const component = safeScriptValue(componentSource);
  const runtimeText = safeScriptValue(runtimeSource);
  return `<!doctype html><html><head><meta charset="utf-8"><base href="https://example.test/playground/"></head><body><script>addEventListener('error',e=>parent.postMessage({type:'skein-error',message:e.error?.stack||e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({type:'skein-error',message:e.reason?.stack||String(e.reason)},'*'));<\/script><script type="module">try{const runtimeURL=URL.createObjectURL(new Blob([${runtimeText}],{type:'text/javascript'}));const {Skein}=await import(runtimeURL);Skein.define('play-ground',${component});const element=document.createElement('play-ground');document.body.append(element);await customElements.whenDefined('play-ground');await new Promise(resolve=>setTimeout(resolve,0));parent.postMessage({type:'skein-ready',text:element.shadowRoot?.textContent?.trim(),origin:location.origin},'*')}catch(error){parent.postMessage({type:'skein-error',message:error.stack||String(error)},'*')}<\/script></body></html>`;
};

const runtimeFixture = await readFile(join(root, 'test/runtime.html'), 'utf8');
const testIndex = await readFile(join(root, 'test/index.html'), 'utf8');
const harnessMarker = '<script id="browser-tests">';
const harness = testIndex.slice(testIndex.indexOf(harnessMarker) + harnessMarker.length, testIndex.lastIndexOf('</script>'));

const { socket, send, exceptions } = await connect();
try {
  await newDocument(send, '<test-runtime></test-runtime><inline-boot></inline-boot><template skein="inline-boot"><script>this.word="woven"<\/script><b id="boot-word">{word}</b></template><pre id="results">Running…</pre>');
  await evaluate(send, `window.fetch = async url => String(url).endsWith('test/runtime.html') ? new Response(${JSON.stringify(runtimeFixture)}, { status: 200 }) : new Response('', { status: 404 });`);
  await loadReadable(send);
  await evaluate(send, `Skein.define('row-life','<script>onCleanup(()=>window.__rowDisposals=(window.__rowDisposals||0)+1)<\\/script><i>life</i>')`);
  await evaluate(send, harness);

  let result = {};
  for (let attempt = 0; attempt < 400; attempt++) {
    await sleep(25);
    result = await evaluate(send, `({ status: document.body.dataset.tests, failed: document.body.dataset.failed, text: document.querySelector('#results')?.textContent, benchmark: window.__benchmark })`);
    if (result.status) break;
  }

  console.log(result.text || 'Browser tests did not finish');
  if (result.benchmark) {
    console.log('\nperformance smoke (Chrome, ms):');
    for (const [name, value] of Object.entries(result.benchmark)) console.log(`  ${name}: ${value.toFixed(2)}`);
  }
  if (result.status !== 'passed') throw new Error(`${result.failed || '?'} browser tests failed`);

  // Production bundle: all public binding types, styles, SVG, Canvas and tiny API.
  await newDocument(send, '<prod-test></prod-test>');
  await evaluate(send, `window.fetch=async()=>new Response('',{status:404});window.__canvasOk=false;`);
  await loadMin(send, `
    Skein.define('prod-test', '<script>this.count=1;this.rows=[{id:1,n:"A"},{id:2,n:"B"}];this.show=true;this.double=computed(()=>this.count*2);this.up=()=>this.count++;queueMicrotask(()=>{window.__canvasOk=!!host.shadowRoot.querySelector("canvas").getContext("2d")})<\\/script><style>:host{display:block}b{font-weight:700}</style><button id="up" @click={up}>{count}/{double}</button><i for={rows} key={id} data-id={id}>{n}</i><em if={show}>yes</em><svg><circle id="dot" cx={count} cy="5" r="2"></circle></svg><canvas></canvas>');
  `);
  let prod;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    prod = await evaluate(send, `(() => { const root=document.querySelector('prod-test')?.shadowRoot; return { text:root?.querySelector('#up')?.textContent, rows:root?.querySelectorAll('i').length, style:root?.querySelector('style')?.textContent, cx:root?.querySelector('#dot')?.getAttribute('cx'), canvas:window.__canvasOk, api:Object.keys(Skein).sort().join(',') }; })()`);
    if (prod.text && prod.canvas) break;
  }
  if (prod.text !== '1/2' || prod.rows !== 2 || !prod.style?.includes('font-weight:700') || prod.cx !== '1' || !prod.canvas || prod.api !== 'define,version') {
    throw new Error(`Production runtime smoke failed: ${JSON.stringify(prod)}`);
  }
  await evaluate(send, `document.querySelector('prod-test').shadowRoot.querySelector('#up').click()`);
  await sleep(20);
  prod = await evaluate(send, `({ text:document.querySelector('prod-test').shadowRoot.querySelector('#up').textContent, cx:document.querySelector('prod-test').shadowRoot.querySelector('#dot').getAttribute('cx') })`);
  if (prod.text !== '2/4' || prod.cx !== '2') throw new Error(`Production update failed: ${JSON.stringify(prod)}`);
  console.log('min-runtime: passed');

  // Minifier regression: strings such as template[skein] must never be mangled.
  await newDocument(send, '<min-inline></min-inline><template skein="min-inline"><script>this.word="small"<\/script><b id="word">{word}</b></template>');
  await loadMin(send);
  let inline;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    inline = await evaluate(send, `document.querySelector('min-inline')?.shadowRoot?.querySelector('#word')?.textContent`);
    if (inline) break;
  }
  if (inline !== 'small') throw new Error(`Minified inline bootstrap failed: ${inline}`);
  console.log('min-bootstrap: passed');

  // Late source registration must recover a connected nested component inside Shadow DOM.
  await newDocument(send, '');
  await evaluate(send, `window.fetch=async()=>new Response('',{status:404});`);
  await loadMin(send, `Skein.define('late-parent','<late-child></late-child>');document.body.append(document.createElement('late-parent'));`);
  await sleep(40);
  await evaluate(send, `Skein.define('late-child','<b id="late">ready</b>')`);
  let late;
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(20);
    late = await evaluate(send, `document.querySelector('late-parent')?.shadowRoot?.querySelector('late-child')?.shadowRoot?.querySelector('#late')?.textContent`);
    if (late) break;
  }
  if (late !== 'ready') throw new Error(`Late nested define failed: ${late}`);
  console.log('late-define: passed');

  // Playground regression: literal </script> in user source inside an opaque-origin sandbox.
  await newDocument(send, '<iframe id="preview" sandbox="allow-scripts"></iframe>');
  const sandboxSource = '<script>this.count=0;this.up=()=>this.count++</script><button @click={up}>clicked {count}</button>';
  const srcdoc = playgroundSrcdoc(sandboxSource, minRuntime);
  await evaluate(send, `window.__playgroundResult=null;addEventListener('message',event=>{if(event.source===document.querySelector('#preview').contentWindow)window.__playgroundResult=event.data});document.querySelector('#preview').srcdoc=${JSON.stringify(srcdoc)}`);
  let playgroundResult;
  for (let attempt = 0; attempt < 150; attempt++) {
    await sleep(20);
    playgroundResult = await evaluate(send, 'window.__playgroundResult');
    if (playgroundResult) break;
  }
  if (playgroundResult?.type !== 'skein-ready' || playgroundResult.text !== 'clicked 0' || playgroundResult.origin !== 'null') {
    throw new Error(`Playground sandbox failed: ${JSON.stringify(playgroundResult)}`);
  }
  console.log('playground-sandbox: passed');

  if (exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`);
} finally {
  socket.close();
  browser.kill('SIGTERM');
  await Promise.race([once(browser, 'exit'), sleep(1000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const core = spawnSync(process.execPath, [join(root, 'test/core-node.mjs')], { cwd: root, encoding: 'utf8' });
process.stdout.write(core.stdout || '');
process.stderr.write(core.stderr || '');
if (core.status !== 0) process.exit(core.status || 1);

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

const profile = await mkdtemp(join(tmpdir(), 'web-component-chrome-'));
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
  await sleep(50);
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

async function loadRuntime(send) {
  const expression = `(async () => {
    const reactiveURL = URL.createObjectURL(new Blob([${JSON.stringify(modules.reactive)}], { type: 'text/javascript' }));
    const templateSource = ${JSON.stringify(modules.template)}.replace('./reactive.js', reactiveURL);
    const templateURL = URL.createObjectURL(new Blob([templateSource], { type: 'text/javascript' }));
    const componentSource = ${JSON.stringify(modules.component)}
      .replace('./reactive.js', reactiveURL)
      .replace('./template.js', templateURL);
    const componentURL = URL.createObjectURL(new Blob([componentSource], { type: 'text/javascript' }));
    const entrySource = ${JSON.stringify(modules.entry)}.replace('./runtime/component.js', componentURL);
    const entryURL = URL.createObjectURL(new Blob([entrySource], { type: 'text/javascript' }));
    await import(entryURL);
  })()`;
  await evaluate(send, expression, { awaitPromise: true });
}

const { examples: siteExamples } = await import(new URL('../site/examples.js', import.meta.url));
const runtimeFixture = await readFile(join(root, 'test/runtime.html'), 'utf8');
const testIndex = await readFile(join(root, 'test/index.html'), 'utf8');
const harness = [...testIndex.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean).at(-1);

const legacyFiles = {};
for (const path of ['page/test.html', 'test/canvas.html', 'test/function.html', 'test/binding.html']) {
  legacyFiles[path] = await readFile(join(root, path), 'utf8');
}

const { socket, send, exceptions } = await connect();
try {
  await newDocument(send, '<test-runtime></test-runtime><inline-boot></inline-boot><template skein="inline-boot"><script>this.word="woven"<\/script><b id="boot-word">{word}</b></template><pre id="results">Running…</pre>');
  await evaluate(send, `window.fetch = async url => String(url).endsWith('test/runtime.html') ? new Response(${JSON.stringify(runtimeFixture)}, { status: 200, headers: { 'Content-Type': 'text/html' } }) : new Response('', { status: 404 });`);
  await loadRuntime(send);
  await evaluate(send, `window.__siteExamples = ${JSON.stringify(siteExamples.map(({ id, source }) => ({ id, source })))}`);
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

  await newDocument(send, '<page-test></page-test>');
  await evaluate(send, `window.__files = ${JSON.stringify(legacyFiles)}; window.fetch = async url => { const path = new URL(String(url)).pathname.slice(1); return path in window.__files ? new Response(window.__files[path], { status: 200 }) : new Response('', { status: 404 }); };`);
  await loadRuntime(send);
  await sleep(300);
  const legacy = await evaluate(send, `(() => { const page = document.querySelector('page-test'); const root = page.shadowRoot; const fn = root?.querySelector('test-function'); const binding = root?.querySelector('test-binding'); const canvas = root?.querySelector('test-canvas'); return { page: !!root, buttons: fn?.shadowRoot?.querySelectorAll('button').length, binding: binding?.shadowRoot?.querySelector('h1')?.textContent, canvas: canvas?.shadowRoot?.querySelector('canvas')?.getAttribute('width') }; })()`);
  if (!legacy.page || legacy.buttons !== 99 || legacy.binding !== 'John Doe, 30' || legacy.canvas !== '500') {
    throw new Error(`Legacy smoke failed: ${JSON.stringify(legacy)}`);
  }
  if (exceptions.length) throw new Error(`Browser exceptions:\n${exceptions.join('\n')}`);
  console.log('legacy-browser: passed');
} finally {
  socket.close();
  browser.kill('SIGTERM');
  await Promise.race([once(browser, 'exit'), sleep(1000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

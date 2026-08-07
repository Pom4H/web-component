import { examples, exampleById } from '../site/examples.js';
import { highlight } from '../site/highlight.js';

const $ = selector => document.querySelector(selector);
const source = $('#source');
const highlighted = $('#highlight code');
const preview = $('#preview');
const exampleSelect = $('#example');
const auto = $('#autorun');
const state = $('#state');
const errorBox = $('#error');
let timer;

const runtime = fetch(new URL('../skein.min.js', location.href)).then(async response => {
  if (!response.ok) throw new Error(`Cannot load Skein runtime: ${response.status}`);
  return response.text();
});

for (const example of examples) {
  exampleSelect.add(new Option(`${example.kind.toLowerCase()} / ${example.title}`, example.id));
}

const encode = value => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const decode = value => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};
const scriptValue = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const params = new URLSearchParams(location.search);
const requestedExample = params.get('example');
const selected = exampleById(requestedExample || 'kinetic');
exampleSelect.value = selected.id;

let sharedSource;
if (location.hash.startsWith('#code=')) {
  try { sharedSource = decode(location.hash.slice(6)); } catch {}
}

const saved = localStorage.getItem('skein.playground');
source.value = sharedSource ?? (requestedExample ? selected.source : saved || selected.source);

function paint() {
  highlighted.innerHTML = highlight(source.value);
  $('#lines').textContent = `${source.value.split('\n').length} lines`;
  $('#bytes').textContent = `${new Blob([source.value]).size} B`;
  localStorage.setItem('skein.playground', source.value);
}

function srcdoc(value, runtimeSource) {
  const component = scriptValue(value);
  const runtimeText = scriptValue(runtimeSource);
  const base = location.href.replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><style>html,body{margin:0;min-height:100%;height:100%}body{display:grid}play-ground{display:block;min-height:100%;height:100%}</style></head><body><script>addEventListener('error',e=>parent.postMessage({type:'skein-error',message:e.error?.stack||e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({type:'skein-error',message:e.reason?.stack||String(e.reason)},'*'));<\/script><script type="module">try{const runtimeURL=URL.createObjectURL(new Blob([${runtimeText}],{type:'text/javascript'}));const {Skein}=await import(runtimeURL);Skein.define('play-ground',${component});const element=document.createElement('play-ground');document.body.append(element);await customElements.whenDefined('play-ground');await new Promise(resolve=>setTimeout(resolve,0));parent.postMessage({type:'skein-ready'},'*')}catch(error){parent.postMessage({type:'skein-error',message:error.stack||String(error)},'*')}<\/script></body></html>`;
}

async function run() {
  clearTimeout(timer);
  state.textContent = 'running…';
  errorBox.hidden = true;
  try {
    preview.srcdoc = srcdoc(source.value, await runtime);
  } catch (error) {
    state.textContent = 'error';
    errorBox.hidden = false;
    errorBox.textContent = error.stack || String(error);
  }
}

function schedule() {
  paint();
  if (!auto.checked) {
    state.textContent = 'edited';
    return;
  }
  clearTimeout(timer);
  state.textContent = 'queued';
  timer = setTimeout(run, 260);
}

source.addEventListener('input', schedule);
source.addEventListener('scroll', () => {
  $('#highlight').scrollTop = source.scrollTop;
  $('#highlight').scrollLeft = source.scrollLeft;
});
source.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  const start = source.selectionStart;
  const end = source.selectionEnd;
  source.setRangeText('  ', start, end, 'end');
  schedule();
});

auto.addEventListener('change', () => {
  clearTimeout(timer);
  if (auto.checked) run();
  else state.textContent = 'manual';
});

exampleSelect.addEventListener('change', () => {
  const example = exampleById(exampleSelect.value);
  source.value = example.source;
  history.replaceState(null, '', `?example=${example.id}`);
  paint();
  run();
});

$('#run').addEventListener('click', run);
$('#reload').addEventListener('click', run);
$('#fullscreen').addEventListener('click', () => preview.requestFullscreen?.());
$('#share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}${location.search}#code=${encode(source.value)}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    $('#share').textContent = 'Copied';
    setTimeout(() => $('#share').textContent = 'Share', 1100);
  } catch {}
});

window.addEventListener('message', event => {
  if (event.source !== preview.contentWindow) return;
  if (event.data?.type === 'skein-ready') state.textContent = 'live';
  if (event.data?.type === 'skein-error') {
    state.textContent = 'error';
    errorBox.hidden = false;
    errorBox.textContent = event.data.message;
  }
});

paint();
run();

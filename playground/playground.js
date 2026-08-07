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
const runtimeURL = new URL('../skein.js', location.href).href;
let timer;

for (const example of examples) exampleSelect.add(new Option(`${example.kind.toLowerCase()} / ${example.title}`, example.id));

const encode = value => btoa(unescape(encodeURIComponent(value)));
const decode = value => decodeURIComponent(escape(atob(value)));
const params = new URLSearchParams(location.search);
let initial;
if (location.hash.startsWith('#code=')) {
  try { initial = decode(location.hash.slice(6)); } catch {}
}
const selected = params.get('example') || 'kinetic';
exampleSelect.value = selected;
source.value = initial || localStorage.getItem('skein.playground') || exampleById(selected).source;

function paint() {
  highlighted.innerHTML = highlight(source.value);
  $('#lines').textContent = `${source.value.split('\n').length} lines`;
  $('#bytes').textContent = `${new Blob([source.value]).size} B`;
  localStorage.setItem('skein.playground', source.value);
}

function srcdoc(value) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;height:100%}body{display:grid}play-ground{display:block;min-height:100%;height:100%}</style></head><body><play-ground></play-ground><script>addEventListener('error',e=>parent.postMessage({type:'skein-error',message:e.error?.stack||e.message},'*'));addEventListener('unhandledrejection',e=>parent.postMessage({type:'skein-error',message:e.reason?.stack||String(e.reason)},'*'));<\/script><script type="module">try{const {Skein}=await import(${JSON.stringify(runtimeURL)});Skein.define('play-ground',${JSON.stringify(value)});await customElements.whenDefined('play-ground');queueMicrotask(()=>parent.postMessage({type:'skein-ready',stats:Skein.stats},'*'));}catch(error){parent.postMessage({type:'skein-error',message:error.stack||String(error)},'*')}<\/script></body></html>`;
}

function run() {
  clearTimeout(timer);
  state.textContent = 'running…';
  errorBox.hidden = true;
  preview.srcdoc = srcdoc(source.value);
}

function schedule() {
  paint();
  if (!auto.checked) { state.textContent = 'edited'; return; }
  clearTimeout(timer);
  state.textContent = 'queued';
  timer = setTimeout(run, 260);
}

source.addEventListener('input', schedule);
source.addEventListener('scroll', () => { $('#highlight').scrollTop = source.scrollTop; $('#highlight').scrollLeft = source.scrollLeft; });
source.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  const start = source.selectionStart, end = source.selectionEnd;
  source.setRangeText('  ', start, end, 'end');
  schedule();
});

exampleSelect.addEventListener('change', () => {
  source.value = exampleById(exampleSelect.value).source;
  history.replaceState(null, '', `?example=${exampleSelect.value}`);
  paint(); run();
});
$('#run').addEventListener('click', run); $('#reload').addEventListener('click', run);
$('#fullscreen').addEventListener('click', () => preview.requestFullscreen?.());
$('#share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}${location.search}#code=${encode(source.value)}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); $('#share').textContent = 'Copied'; setTimeout(()=>$('#share').textContent='Share',1100); } catch {}
});
window.addEventListener('message', event => {
  if (event.source !== preview.contentWindow) return;
  if (event.data?.type === 'skein-ready') state.textContent = 'live';
  if (event.data?.type === 'skein-error') { state.textContent = 'error'; errorBox.hidden = false; errorBox.textContent = event.data.message; }
});

paint(); run();

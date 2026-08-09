import { examples, exampleById } from '../site/examples.js';
import { highlight } from '../site/highlight.js';
import { cursorLabel, indentSelection, insertIndentedNewline } from './editor.js';

const $ = selector => document.querySelector(selector);
const source = $('#source');
const editorWrap = $('#editor-wrap');
const highlightLayer = $('#highlight');
const highlighted = $('#highlight code');
const lineNumberLayer = $('#line-numbers');
const lineNumbers = $('#line-numbers code');
const preview = $('#preview');
const previewPane = $('#preview-pane');
const exampleSelect = $('#example');
const auto = $('#autorun');
const state = $('#state');
const draftState = $('#draft-state');
const errorBox = $('#error');
const errorMessage = $('#error-message');
const actionFeedback = $('#action-feedback');
const workspace = $('#workspace');
const splitter = $('#splitter');
const shareButton = $('#share');

const DRAFT_PREFIX = 'skein.playground.draft.';
const SPLIT_KEY = 'skein.playground.editorRatio';
const DEFAULT_SPLIT = 0.45;
const MIN_EDITOR = 280;
const MIN_PREVIEW = 320;
const DESKTOP_QUERY = matchMedia('(min-width: 821px)');

let runTimer;
let draftTimer;
let currentRun = 0;
let failedRun = 0;
let currentLoad = 0;
let currentExample;
let originalSource = '';
let lastSavedSource = '';
let splitRatio = DEFAULT_SPLIT;
const feedbackTimers = new WeakMap();

const runtime = fetch(new URL('../skein.min.js', location.href)).then(async response => {
  if (!response.ok) throw new Error(`Cannot load Skein runtime: ${response.status}`);
  return response.text();
});

const originals = new Map();
const loadExample = async example => {
  if (originals.has(example.id)) return originals.get(example.id);
  const response = await fetch(new URL(example.file, location.href));
  if (!response.ok) throw new Error(`Cannot load ${example.file}: ${response.status}`);
  const value = await response.text();
  originals.set(example.id, value);
  return value;
};

const readLocal = key => {
  try { return localStorage.getItem(key); } catch { return null; }
};

const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeLocal = key => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const draftKey = example => `${DRAFT_PREFIX}${example.id}`;

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

const setRunState = (kind, label) => {
  state.dataset.state = kind;
  state.textContent = label;
  previewPane.setAttribute('aria-busy', kind === 'running' || kind === 'queued' ? 'true' : 'false');
};

const setDraftState = (kind, label) => {
  draftState.dataset.state = kind;
  draftState.textContent = label;
};

const announce = message => {
  actionFeedback.textContent = '';
  requestAnimationFrame(() => { actionFeedback.textContent = message; });
};

const buttonFeedback = (button, label, message = label) => {
  clearTimeout(feedbackTimers.get(button));
  const defaultLabel = button.dataset.defaultLabel || button.textContent;
  button.dataset.defaultLabel = defaultLabel;
  button.textContent = label;
  announce(message);
  feedbackTimers.set(button, setTimeout(() => {
    button.textContent = defaultLabel;
    feedbackTimers.delete(button);
  }, 1400));
};

const clearSharedHash = () => {
  if (!location.hash.startsWith('#code=')) return;
  const url = new URL(location.href);
  url.hash = '';
  history.replaceState(null, '', url);
};

function paint() {
  const value = source.value;
  const count = value.split('\n').length;
  highlighted.innerHTML = highlight(value);
  lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
  editorWrap.style.setProperty('--gutter-width', `${Math.max(46, String(count).length * 8 + 26)}px`);
  $('#lines').textContent = `${count} ${count === 1 ? 'line' : 'lines'}`;
  $('#bytes').textContent = `${new Blob([value]).size.toLocaleString()} B`;
  $('#cursor-status').textContent = cursorLabel(value, source.selectionStart, source.selectionEnd);
  highlightLayer.scrollTop = source.scrollTop;
  highlightLayer.scrollLeft = source.scrollLeft;
  lineNumberLayer.scrollTop = source.scrollTop;
}

const updateCursor = () => {
  $('#cursor-status').textContent = cursorLabel(source.value, source.selectionStart, source.selectionEnd);
};

const persistDraft = ({ feedback = false } = {}) => {
  clearTimeout(draftTimer);
  if (!currentExample) return false;

  let saved;
  if (source.value === originalSource) {
    saved = removeLocal(draftKey(currentExample));
    if (saved) setDraftState('original', 'Original');
  } else {
    saved = writeLocal(draftKey(currentExample), source.value);
    if (saved) setDraftState('saved', 'Saved locally');
  }

  if (saved) {
    lastSavedSource = source.value;
    if (feedback) announce(source.value === originalSource ? 'Original source saved' : 'Draft saved locally');
  } else {
    setDraftState('error', 'Could not save');
    announce('Local storage is unavailable; the draft could not be saved');
  }
  return saved;
};

const queueDraftSave = () => {
  clearTimeout(draftTimer);
  setDraftState('edited', 'Unsaved');
  draftTimer = setTimeout(() => persistDraft(), 500);
};

function srcdoc(value, runtimeSource, runId) {
  const component = scriptValue(value);
  const runtimeText = scriptValue(runtimeSource);
  const base = location.href.replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${base}"><style>html,body{margin:0;min-height:100%;height:100%}body{display:grid}play-ground{display:block;min-height:100%;height:100%}</style></head><body><script>const send=(type,message)=>parent.postMessage({type,message,runId:${runId}},'*');addEventListener('error',event=>send('skein-error',event.error?.stack||event.message));addEventListener('unhandledrejection',event=>send('skein-error',event.reason?.stack||String(event.reason)));<\/script><script type="module">try{const runtimeURL=URL.createObjectURL(new Blob([${runtimeText}],{type:'text/javascript'}));const {Skein}=await import(runtimeURL);Skein.define('play-ground',${component});const element=document.createElement('play-ground');document.body.append(element);await customElements.whenDefined('play-ground');await new Promise(resolve=>setTimeout(resolve,0));send('skein-ready')}catch(error){send('skein-error',error.stack||String(error))}<\/script></body></html>`;
}

const hideError = () => {
  errorBox.hidden = true;
  errorMessage.textContent = '';
};

const showError = error => {
  setRunState('error', 'Error');
  errorMessage.textContent = error?.stack || String(error);
  errorBox.hidden = false;
};

async function run() {
  clearTimeout(runTimer);
  const runId = ++currentRun;
  failedRun = 0;
  hideError();
  setRunState('running', 'Running…');
  try {
    const runtimeSource = await runtime;
    if (runId !== currentRun) return;
    preview.srcdoc = srcdoc(source.value, runtimeSource, runId);
  } catch (error) {
    if (runId === currentRun) showError(error);
  }
}

function schedule() {
  paint();
  clearSharedHash();
  queueDraftSave();
  currentRun++;
  clearTimeout(runTimer);
  if (!auto.checked) {
    setRunState('manual', 'Edited · Run to preview');
    return;
  }
  setRunState('queued', 'Queued');
  runTimer = setTimeout(run, 260);
}

const replaceEditorValue = edit => {
  source.value = edit.value;
  source.setSelectionRange(edit.start, edit.end);
  schedule();
};

const loadSelectedExample = async (example, { shared } = {}) => {
  const loadId = ++currentLoad;
  currentRun++;
  failedRun = 0;
  clearTimeout(runTimer);
  setRunState('loading', 'Loading example…');
  hideError();
  try {
    const loadedSource = await loadExample(example);
    if (loadId !== currentLoad) return;
    originalSource = loadedSource;
    currentExample = example;
    exampleSelect.value = example.id;
    const saved = readLocal(draftKey(example));
    source.value = shared ?? saved ?? originalSource;
    lastSavedSource = shared ?? saved ?? originalSource;
    if (shared != null) setDraftState('shared', 'Shared code');
    else if (saved != null) setDraftState('saved', 'Local draft');
    else setDraftState('original', 'Original');
    source.setSelectionRange(0, 0);
    paint();
    await run();
  } catch (error) {
    if (loadId === currentLoad) showError(error);
  }
};

source.addEventListener('input', schedule);
source.addEventListener('scroll', () => {
  highlightLayer.scrollTop = source.scrollTop;
  highlightLayer.scrollLeft = source.scrollLeft;
  lineNumberLayer.scrollTop = source.scrollTop;
});
source.addEventListener('select', updateCursor);
source.addEventListener('keyup', updateCursor);
source.addEventListener('pointerup', updateCursor);
source.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    replaceEditorValue(indentSelection(source.value, source.selectionStart, source.selectionEnd, event.shiftKey));
    return;
  }
  if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    replaceEditorValue(insertIndentedNewline(source.value, source.selectionStart, source.selectionEnd));
  }
});

document.addEventListener('selectionchange', () => {
  if (document.activeElement === source) updateCursor();
});

document.addEventListener('keydown', event => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    run();
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault();
    persistDraft({ feedback: true });
  }
});

auto.addEventListener('change', () => {
  currentRun++;
  clearTimeout(runTimer);
  if (auto.checked) run();
  else setRunState('manual', 'Manual · Run when ready');
});

exampleSelect.addEventListener('change', async () => {
  if (source.value !== lastSavedSource) persistDraft();
  const example = exampleById(exampleSelect.value);
  const url = new URL(location.href);
  url.searchParams.set('example', example.id);
  url.hash = '';
  history.replaceState(null, '', url);
  await loadSelectedExample(example);
});

$('#run').addEventListener('click', run);
$('#reload').addEventListener('click', run);
$('#fullscreen').addEventListener('click', () => preview.requestFullscreen?.());
$('#dismiss-error').addEventListener('click', hideError);

$('#reset').addEventListener('click', () => {
  if (source.value === originalSource) {
    buttonFeedback($('#reset'), 'Original ✓', 'The original example is already loaded');
    return;
  }
  if (!confirm('Reset this example to its original source?')) return;
  clearTimeout(draftTimer);
  clearSharedHash();
  source.value = originalSource;
  source.setSelectionRange(0, 0);
  removeLocal(draftKey(currentExample));
  lastSavedSource = originalSource;
  setDraftState('original', 'Original');
  paint();
  if (auto.checked) run();
  else setRunState('manual', 'Reset · Run to preview');
  source.focus();
  announce('Original example restored');
});

const copyText = async value => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const focused = document.activeElement;
    const copy = document.createElement('textarea');
    copy.value = value;
    copy.setAttribute('readonly', '');
    copy.style.cssText = 'position:fixed;inset:auto auto 0 -9999px';
    document.body.append(copy);
    copy.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch {}
    copy.remove();
    focused?.focus({ preventScroll: true });
    return copied;
  }
};

shareButton.addEventListener('click', async () => {
  if (!currentExample) {
    buttonFeedback(shareButton, 'Not ready', 'Wait for the example to finish loading');
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set('example', currentExample.id);
  url.hash = `code=${encode(source.value)}`;
  const value = url.toString();
  try { history.replaceState(null, '', value); } catch {}
  const copied = await copyText(value);
  if (copied) buttonFeedback(shareButton, 'Copied ✓', 'Share link copied');
  else {
    buttonFeedback(shareButton, 'Copy failed', 'Could not copy the share link');
    prompt('Copy this share link:', value);
  }
});

window.addEventListener('message', event => {
  if (event.source !== preview.contentWindow || event.data?.runId !== currentRun) return;
  if (event.data.type === 'skein-error') {
    failedRun = event.data.runId;
    showError(event.data.message);
  }
  if (event.data.type === 'skein-ready' && failedRun !== event.data.runId) setRunState('live', 'Live');
});

const splitBounds = () => {
  const width = workspace.getBoundingClientRect().width;
  if (!DESKTOP_QUERY.matches) return { min: 0, max: 1 };
  return {
    min: MIN_EDITOR / Math.max(width, 1),
    max: (width - 7 - MIN_PREVIEW) / Math.max(width, 1)
  };
};

const applySplit = (ratio, save = false) => {
  const { min, max } = splitBounds();
  splitRatio = Math.min(max, Math.max(min, ratio));
  workspace.style.setProperty('--editor-size', `${splitRatio * 100}%`);
  const percent = Math.round(splitRatio * 100);
  splitter.setAttribute('aria-valuemin', Math.round(min * 100));
  splitter.setAttribute('aria-valuemax', Math.round(max * 100));
  splitter.setAttribute('aria-valuenow', percent);
  splitter.setAttribute('aria-valuetext', `Editor ${percent} percent`);
  if (save) writeLocal(SPLIT_KEY, String(splitRatio));
};

const storedSplit = Number.parseFloat(readLocal(SPLIT_KEY));
applySplit(Number.isFinite(storedSplit) ? storedSplit : DEFAULT_SPLIT);

splitter.addEventListener('pointerdown', event => {
  if (!DESKTOP_QUERY.matches || event.button !== 0) return;
  splitter.setPointerCapture(event.pointerId);
  splitter.focus();
  document.body.classList.add('is-resizing');
});

splitter.addEventListener('pointermove', event => {
  if (!splitter.hasPointerCapture(event.pointerId)) return;
  const bounds = workspace.getBoundingClientRect();
  applySplit((event.clientX - bounds.left) / bounds.width);
});

const finishResize = () => {
  if (!document.body.classList.contains('is-resizing')) return;
  document.body.classList.remove('is-resizing');
  applySplit(splitRatio, true);
};

splitter.addEventListener('pointerup', finishResize);
splitter.addEventListener('pointercancel', finishResize);
splitter.addEventListener('lostpointercapture', finishResize);
splitter.addEventListener('dblclick', () => applySplit(DEFAULT_SPLIT, true));
splitter.addEventListener('keydown', event => {
  if (!DESKTOP_QUERY.matches) return;
  const { min, max } = splitBounds();
  const step = event.shiftKey ? 0.08 : 0.02;
  let next = splitRatio;
  if (event.key === 'ArrowLeft') next -= step;
  else if (event.key === 'ArrowRight') next += step;
  else if (event.key === 'Home') next = min;
  else if (event.key === 'End') next = max;
  else return;
  event.preventDefault();
  applySplit(next, true);
});

window.addEventListener('resize', () => applySplit(splitRatio));
window.addEventListener('pagehide', () => {
  if (source.value !== lastSavedSource) persistDraft();
});

const params = new URLSearchParams(location.search);
const selected = exampleById(params.get('example') || 'counter');
let sharedSource;
if (location.hash.startsWith('#code=')) {
  try { sharedSource = decode(location.hash.slice(6)); } catch {}
}
loadSelectedExample(selected, { shared: sharedSource });

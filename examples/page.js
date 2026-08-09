import { examples } from '../site/examples.js';

const gallery = document.querySelector('#gallery');
const runtimeURL = new URL('../skein.min.js', location.href).href;
const examplesBase = new URL('./', location.href).href;
const compositions = [
  {
    tag: 'workspace-app',
    title: 'Workspace',
    kind: 'APP / 18',
    blurb: 'A scale proof: 18 HTML component files compose through native slots, DOM properties and composed events — no store or component bus.',
    href: './workspace/',
    link: 'Open application →'
  },
  {
    tag: 'studio-app',
    title: 'Skein Studio',
    kind: 'AUDIO / CANVAS',
    blurb: 'A browser-only instrument where Web Audio produces the sound, Canvas draws the signal and five HTML component files coordinate through the DOM.',
    href: 'https://github.com/Pom4H/web-component/tree/main/examples/studio',
    link: 'Open composition →'
  }
];

const srcdoc = example => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${examplesBase}">
  <style>html,body{margin:0;height:100%}body{min-height:100%;overflow:${example.tag === 'studio-app' ? 'auto' : 'hidden'}}${example.tag}{display:block;${example.tag === 'studio-app' ? 'min-height:100%' : 'height:100vh'}}</style>
</head>
<body>
  <${example.tag}></${example.tag}>
  <script type="module" src="${runtimeURL}"><\/script>
</body>
</html>`;

gallery.replaceChildren();
for (const example of [...compositions, ...examples]) {
  const card = document.createElement('article');
  const href = example.href || `../playground/?example=${example.id}`;
  const label = example.link || 'Open source →';
  card.className = `demo-card${example.tag === 'workspace-app' || example.tag === 'studio-app' ? ' demo-card--featured' : ''}`;
  const frameClass = `demo-frame${example.tag === 'studio-app' ? ' demo-frame--studio' : ''}`;
  card.innerHTML = `<iframe class="${frameClass}" title="${example.title}" allow="autoplay *"></iframe><div class="demo-meta"><div><h2>${example.title}</h2><p>${example.blurb}</p><a class="demo-link" href="${href}">${label}</a></div><span class="pill">${example.kind}</span></div>`;
  card.querySelector('iframe').srcdoc = srcdoc(example);
  gallery.append(card);
}

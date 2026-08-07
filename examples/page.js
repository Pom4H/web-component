import { examples } from '../site/examples.js';

const gallery = document.querySelector('#gallery');
const runtimeURL = new URL('../skein.min.js', location.href).href;
const examplesBase = new URL('./', location.href).href;
const studio = {
  tag: 'studio-app',
  title: 'Skein Studio',
  kind: 'COMPOSE',
  blurb: 'Five file-loaded Web Components coordinate through reactive DOM properties down and native CustomEvents up.',
  source: 'https://github.com/Pom4H/web-component/tree/main/examples/studio'
};

const srcdoc = example => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <base href="${examplesBase}">
  <style>html,body{margin:0;height:100%;overflow:hidden}body{min-height:100%}${example.tag}{display:block;height:100vh}</style>
</head>
<body>
  <${example.tag}></${example.tag}>
  <script type="module" src="${runtimeURL}"><\/script>
</body>
</html>`;

gallery.replaceChildren();
for (const example of [studio, ...examples]) {
  const card = document.createElement('article');
  const sourceHref = example.source || `../playground/?example=${example.id}`;
  const sourceLabel = example.source ? 'Open composition →' : 'Open source →';
  card.className = 'demo-card';
  card.innerHTML = `<iframe class="demo-frame" title="${example.title}"></iframe><div class="demo-meta"><div><h2>${example.title}</h2><p>${example.blurb}</p><a class="demo-link" href="${sourceHref}">${sourceLabel}</a></div><span class="pill">${example.kind}</span></div>`;
  card.querySelector('iframe').srcdoc = srcdoc(example);
  gallery.append(card);
}

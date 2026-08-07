import { examples } from '../site/examples.js';

const gallery = document.querySelector('#gallery');
const runtimeURL = new URL('../skein.min.js', location.href).href;
const examplesBase = new URL('./', location.href).href;

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
for (const example of examples) {
  const card = document.createElement('article');
  card.className = 'demo-card';
  card.innerHTML = `<iframe class="demo-frame" title="${example.title}"></iframe><div class="demo-meta"><div><h2>${example.title}</h2><p>${example.blurb}</p><a class="demo-link" href="../playground/?example=${example.id}">Open source →</a></div><span class="pill">${example.kind}</span></div>`;
  card.querySelector('iframe').srcdoc = srcdoc(example);
  gallery.append(card);
}

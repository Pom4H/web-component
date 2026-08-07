import { examples } from '../site/examples.js';

const gallery = document.querySelector('#gallery');
const runtimeURL = new URL('../skein.min.js', location.href).href;

const srcdoc = (source, index) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}body{min-height:100%}</style><div id="mount"></div><script type="module">import { Skein } from ${JSON.stringify(runtimeURL)};Skein.define('demo-${index}', ${JSON.stringify(source).replaceAll('<', '\\u003c')});document.querySelector('#mount').append(document.createElement('demo-${index}'));const el=document.querySelector('demo-${index}');el.style.display='block';el.style.height='100vh';<\/script>`;

gallery.replaceChildren();
for (const [index, example] of examples.entries()) {
  const card = document.createElement('article');
  card.className = 'demo-card';
  card.innerHTML = `<iframe class="demo-frame" title="${example.title}"></iframe><div class="demo-meta"><div><h2>${example.title}</h2><p>${example.blurb}</p><a class="demo-link" href="../playground/?example=${example.id}">Open source →</a></div><span class="pill">${example.kind}</span></div>`;
  card.querySelector('iframe').srcdoc = srcdoc(example.source, index);
  gallery.append(card);
}

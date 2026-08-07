import { Skein } from '../skein.min.js';
import { highlight } from './highlight.js';

Skein.define('skein-nav', `
<nav>
  <a class="brand" href="./" data-root><span class="mark">S</span><b>Skein</b></a>
  <div class="links">
    <a href="start/" data-path="start">Start</a>
    <a href="examples/" data-path="examples">Examples</a>
    <a href="docs/" data-path="docs">Docs</a>
    <a href="ai/" data-path="ai">AI</a>
    <a class="play" href="playground/" data-path="playground">Play</a>
    <a class="gh" href="https://github.com/Pom4H/web-component" target="_blank" rel="noreferrer">GitHub ↗</a>
  </div>
</nav>
<style>
  :host { display:block; position:relative; z-index:100; }
  nav { height:72px; display:flex; align-items:center; justify-content:space-between; gap:24px; padding:0 max(20px, calc((100vw - 1280px)/2)); font:600 13px/1 system-ui,sans-serif; }
  a { color:inherit; text-decoration:none; }
  .brand { display:flex; align-items:center; gap:9px; font-size:17px; letter-spacing:-.02em; }
  .mark { display:grid; place-items:center; width:28px; aspect-ratio:1; border-radius:50%; background:var(--ink,#111); color:var(--paper,#f5f1e7); font:900 14px/1 Arial Black,sans-serif; transform:rotate(-12deg); }
  .links { display:flex; align-items:center; gap:22px; }
  .links a { opacity:.7; transition:opacity .2s, transform .2s; }
  .links a:hover { opacity:1; transform:translateY(-1px); }
  .play { padding:10px 15px; border:1px solid currentColor; border-radius:999px; opacity:1!important; }
  @media(max-width:760px){ nav{height:60px}.links{gap:12px}.links a:not(.play):not(.gh){display:none}.gh{font-size:0}.gh::after{content:'↗';font-size:15px} }
</style>`);

Skein.define('skein-footer', `
<footer>
  <div><strong>Skein</strong><span>native web, tightly woven.</span></div>
  <div class="right"><a href="https://github.com/Pom4H/web-component">source</a><span>4.8 kB brotli</span><span>zero dependencies</span><span>2026</span></div>
</footer>
<style>
  :host{display:block;border-top:1px solid var(--line,#d4d0c6);margin-top:80px}
  footer{max-width:1280px;margin:auto;padding:28px 20px 42px;display:flex;justify-content:space-between;gap:24px;color:var(--muted,#6d6a63);font:12px ui-monospace,monospace}
  footer div{display:flex;gap:16px;flex-wrap:wrap} strong{color:var(--ink,#111)} a{color:inherit}
  @media(max-width:650px){footer{flex-direction:column}.right{justify-content:space-between}}
</style>`);

Skein.define('skein-threads', `
<script>
  this.x = 50
  this.y = 48
  this.move = event => {
    const r = event.currentTarget.getBoundingClientRect()
    this.x = ((event.clientX-r.left)/r.width*100).toFixed(1)
    this.y = ((event.clientY-r.top)/r.height*100).toFixed(1)
  }
<\/script>
<div class="field" style="--x:{x}%;--y:{y}%;" @pointermove={move}>
  <svg viewBox="0 0 1000 520" preserveAspectRatio="none" aria-hidden="true">
    <g class="warp">
      <path d="M-80 90 C180 20 330 180 520 105 S830 15 1080 120"/><path d="M-80 170 C150 85 340 250 520 176 S820 92 1080 196"/>
      <path d="M-80 250 C150 162 350 330 520 254 S820 170 1080 275"/><path d="M-80 335 C145 245 345 405 520 340 S835 242 1080 360"/>
      <path d="M-80 420 C160 335 335 485 520 425 S830 330 1080 446"/>
    </g>
    <g class="weft">
      <path d="M160 -80 C70 100 230 220 150 600"/><path d="M330 -80 C250 100 405 235 315 600"/><path d="M500 -80 C420 100 570 235 490 600"/>
      <path d="M670 -80 C590 100 750 220 655 600"/><path d="M840 -80 C760 100 910 225 825 600"/>
    </g>
  </svg>
  <div class="cursor"></div>
</div>
<style>
  :host{display:block;position:absolute;inset:0;pointer-events:auto}
  .field{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at var(--x) var(--y),#ffff8a33 0 8%,transparent 30%)}
  svg{position:absolute;inset:-4%;width:108%;height:108%}
  path{fill:none;stroke:currentColor;stroke-width:1.15;vector-effect:non-scaling-stroke;transition:stroke-width .15s}
  .warp{opacity:.24}.weft{opacity:.11}
  .cursor{position:absolute;left:var(--x);top:var(--y);width:18vmin;aspect-ratio:1;border-radius:50%;border:1px solid currentColor;translate:-50% -50%;opacity:.25;pointer-events:none;transition:left 60ms linear,top 60ms linear}
</style>`);

const base = new URL('../', import.meta.url);
for (const nav of document.querySelectorAll('skein-nav')) {
  let attempts = 0;
  const patch = () => {
    const root = nav.shadowRoot;
    if (!root?.querySelector('.brand')) {
      if (attempts++ < 20) setTimeout(patch, 0);
      return;
    }
    root.querySelector('[data-root]').href = base.href;
    for (const link of root.querySelectorAll('[data-path]')) link.href = new URL(`${link.dataset.path}/`, base).href;
  };
  patch();
}

for (const code of document.querySelectorAll('code[data-highlight]')) code.innerHTML = highlight(code.textContent);

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const selector = button.getAttribute('data-copy');
  const target = selector ? document.querySelector(selector) : null;
  const value = target?.textContent || button.dataset.value || '';
  try {
    await navigator.clipboard.writeText(value.trim());
    const before = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => button.textContent = before, 1200);
  } catch {}
});

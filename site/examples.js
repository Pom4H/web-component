export const examples = [
  {
    id: 'kinetic',
    title: 'Kinetic type',
    kind: 'CSS',
    blurb: 'Pointer-driven typography with reactive CSS custom properties. No render loop.',
    source: `<script>
  this.x = 50
  this.y = 50
  this.move = event => {
    const box = event.currentTarget.getBoundingClientRect()
    this.x = Math.round((event.clientX - box.left) / box.width * 100)
    this.y = Math.round((event.clientY - box.top) / box.height * 100)
  }
<\/script>

<section class="poster" style="--x:{x}%; --y:{y}%;" @pointermove={move}>
  <div class="orb"></div>
  <p>CSS × SIGNALS</p>
  <h1>SKEIN</h1>
  <small>move your pointer</small>
</section>

<style>
  :host { display:block; height:100%; }
  .poster {
    position:relative; min-height:360px; height:100%; overflow:hidden;
    display:grid; place-content:center; padding:2rem; color:#f6f3ea;
    background:#10100f; font-family:Arial Black, Impact, sans-serif;
    container-type:inline-size; cursor:crosshair;
  }
  .poster::before, .poster::after {
    content:""; position:absolute; inset:-30%; pointer-events:none;
    background:repeating-linear-gradient(90deg, transparent 0 9vw, #ffffff12 9vw calc(9vw + 1px));
    transform:rotate(calc((var(--x) - 50%) * .08)); transition:transform 80ms linear;
  }
  .poster::after { transform:rotate(90deg); }
  .orb {
    position:absolute; width:38cqw; aspect-ratio:1; border-radius:50%;
    left:var(--x); top:var(--y); translate:-50% -50%;
    background:radial-gradient(circle at 35% 35%, #f7ff7a, #ff5d5d 48%, #6d43ff 72%, transparent 73%);
    filter:blur(4px); mix-blend-mode:screen; transition:left 80ms linear, top 80ms linear;
  }
  p, h1, small { position:relative; margin:0; z-index:1; }
  p { font:700 .72rem/1 ui-monospace, monospace; letter-spacing:.22em; }
  h1 { font-size:clamp(5rem, 28cqw, 17rem); line-height:.78; letter-spacing:-.09em; transform:skewX(calc((var(--x) - 50%) * -.08)); }
  small { justify-self:end; font:500 .7rem/1 ui-monospace, monospace; opacity:.66; }
</style>`
  },
  {
    id: 'orbit',
    title: 'SVG orbit',
    kind: 'SVG',
    blurb: 'Only the circle coordinates change. The SVG tree is created once and stays native.',
    source: `<script>
  this.cx = 210
  this.cy = 110
  this.t = 0
  let frame
  const draw = () => {
    this.t += .018
    this.cx = 210 + Math.cos(this.t * 1.7) * 118
    this.cy = 110 + Math.sin(this.t * 2.2) * 72
    frame = requestAnimationFrame(draw)
  }
  frame = requestAnimationFrame(draw)
  onCleanup(() => cancelAnimationFrame(frame))
<\/script>

<svg viewBox="0 0 420 220" role="img" aria-label="Reactive orbit">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <path d="M55 110 C105 22 315 22 365 110 C315 198 105 198 55 110Z" />
  <path class="cross" d="M210 20V200M55 110H365" />
  <circle cx={cx} cy={cy} r="18" filter="url(#glow)" />
  <circle class="core" cx={cx} cy={cy} r="4" />
</svg>

<style>
  :host { display:grid; place-items:center; height:100%; background:#e9ff67; }
  svg { width:min(92%, 720px); overflow:visible; }
  path { fill:none; stroke:#121212; stroke-width:1.2; }
  .cross { stroke-dasharray:2 7; opacity:.45; }
  circle { fill:#6b45ff; }
  .core { fill:#fff; }
</style>`
  },
  {
    id: 'canvas',
    title: 'Canvas field',
    kind: 'CANVAS',
    blurb: 'Skein manages state and lifecycle; the Canvas API keeps doing exactly what it is good at.',
    source: `<script>
  this.label = 'move'
  let frame
  let mouse = { x: 160, y: 110 }
  const dots = Array.from({ length: 52 }, (_, i) => ({
    x: (i * 83) % 620, y: (i * 47) % 360, vx: Math.sin(i) * .35, vy: Math.cos(i * 2) * .35
  }))
  this.point = event => {
    const box = event.currentTarget.getBoundingClientRect()
    mouse = { x:(event.clientX-box.left)*620/box.width, y:(event.clientY-box.top)*360/box.height }
    this.label = Math.round(mouse.x) + ' × ' + Math.round(mouse.y)
  }
  queueMicrotask(() => {
    const canvas = host.shadowRoot.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const draw = () => {
      ctx.fillStyle = '#090909'; ctx.fillRect(0,0,620,360)
      for (const p of dots) {
        const dx = mouse.x-p.x, dy = mouse.y-p.y, d = Math.hypot(dx,dy) || 1
        if (d < 130) { p.vx -= dx/d*.012; p.vy -= dy/d*.012 }
        p.vx *= .99; p.vy *= .99; p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > 620) p.vx *= -1
        if (p.y < 0 || p.y > 360) p.vy *= -1
        ctx.beginPath(); ctx.arc(p.x,p.y,2.2,0,Math.PI*2)
        ctx.fillStyle = d < 130 ? '#ff684d' : '#f7f2e8'; ctx.fill()
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
  })
  onCleanup(() => cancelAnimationFrame(frame))
<\/script>

<div class="frame">
  <canvas width="620" height="360" @pointermove={point}></canvas>
  <span>{label}</span>
</div>

<style>
  :host { display:grid; place-items:center; height:100%; background:#090909; }
  .frame { position:relative; width:100%; height:100%; min-height:340px; }
  canvas { width:100%; height:100%; display:block; }
  span { position:absolute; top:14px; left:16px; color:#ff684d; font:12px ui-monospace, monospace; }
</style>`
  },
  {
    id: 'identity',
    title: 'DOM identity',
    kind: 'KEYED',
    blurb: 'Reverse the data. Inputs, focus and custom elements stay alive because rows move instead of rerendering.',
    source: `<script>
  this.people = [
    { id: 1, name: 'Mina', role: 'type' },
    { id: 2, name: 'Noah', role: 'motion' },
    { id: 3, name: 'Iris', role: 'canvas' },
    { id: 4, name: 'Lio', role: 'svg' }
  ]
  this.flip = () => this.people.reverse()
<\/script>

<section>
  <header><strong>identity / preserved</strong><button @click={flip}>reverse</button></header>
  <label for={people} key={id}>
    <b>{name}</b><span>{role}</span><input placeholder="type here, then reverse" />
  </label>
</section>

<style>
  :host { display:block; height:100%; background:#f5f1e7; color:#111; font:14px system-ui; }
  section { padding:22px; }
  header, label { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; }
  header { margin-bottom:18px; }
  header strong { font:700 11px ui-monospace, monospace; letter-spacing:.12em; text-transform:uppercase; }
  button { border:1px solid #111; background:#111; color:#fff; border-radius:999px; padding:8px 14px; cursor:pointer; }
  label { grid-template-columns:70px 70px 1fr; border-top:1px solid #111; padding:12px 0; }
  b { font-size:20px; }
  span { color:#7257ff; font:11px ui-monospace, monospace; }
  input { min-width:0; border:0; border-bottom:1px solid #aaa; background:transparent; padding:8px 2px; outline:none; }
  input:focus { border-color:#7257ff; }
</style>`
  }
];

export const exampleById = id => examples.find(example => example.id === id) || examples[0];

export const labExamples = [
  {
    id: 'signal-room',
    title: 'Signal room',
    kind: 'STATE',
    blurb: 'A live control room: deep reactive records update independently while keyed cards keep their DOM identity.',
    source: `<script>
  this.channels = [
    { id:'temp', label:'CORE TEMP', value:62.4, unit:'°C', limit:78, drift:.17 },
    { id:'flow', label:'FLOW', value:41.8, unit:'L/s', limit:57, drift:.11 },
    { id:'load', label:'LOAD', value:73.1, unit:'%', limit:88, drift:.23 },
    { id:'vibe', label:'VIBRATION', value:2.8, unit:'mm/s', limit:4.5, drift:.06 }
  ]
  this.selected = 'temp'
  this.inspecting = computed(() => this.channels.find(channel => channel.id === this.selected))
  this.alerts = computed(() => this.channels.filter(channel => channel.value > channel.limit).length)
  this.pick = event => this.selected = event.currentTarget.dataset.id
  this.shuffle = () => this.channels.sort(() => Math.random() - .5)

  const timer = setInterval(() => {
    for (const channel of this.channels) {
      channel.value += (Math.random() - .48) * channel.drift
      channel.value = Math.max(0, channel.value)
    }
  }, 180)
  onCleanup(() => clearInterval(timer))
<\/script>

<section class="room">
  <header>
    <div><small>REACTOR / 07</small><h1>Signal room</h1></div>
    <div class="status"><i></i><span>{alerts} alerts</span></div>
  </header>

  <div class="channels">
    <button for={channels} key={id} data-id={id} @click={pick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{unit}</em>
      <meter min="0" max={limit} .value={value}></meter>
    </button>
  </div>

  <footer in={inspecting}>
    <div><small>INSPECTING</small><b>{label}</b></div>
    <div><strong>{value}</strong><span>{unit}</span></div>
    <button @click={shuffle}>reorder channels ↝</button>
  </footer>
</section>

<style>
  :host { display:block; height:100%; background:#0b0e0d; color:#d6ff72; font-family:ui-monospace,monospace; }
  .room { min-height:100%; padding:22px; box-sizing:border-box; background:radial-gradient(circle at 75% 15%,#26371c 0,transparent 36%),#0b0e0d; }
  header, footer { display:flex; align-items:end; justify-content:space-between; gap:18px; }
  h1 { margin:3px 0 0; color:#f3f5ea; font:800 clamp(28px,5vw,54px)/.9 system-ui; letter-spacing:-.06em; }
  small { font-size:9px; letter-spacing:.16em; opacity:.55; }
  .status { display:flex; gap:8px; align-items:center; font-size:10px; text-transform:uppercase; }
  .status i { width:8px; aspect-ratio:1; border-radius:50%; background:currentColor; box-shadow:0 0 18px currentColor; }
  .channels { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:28px 0 20px; }
  .channels button { min-width:0; padding:14px; text-align:left; color:inherit; background:#d6ff7208; border:1px solid #d6ff7230; cursor:pointer; }
  .channels span { display:block; font-size:9px; opacity:.55; letter-spacing:.08em; }
  .channels strong { display:inline-block; margin-top:30px; color:#f3f5ea; font:750 clamp(22px,4vw,44px)/1 system-ui; letter-spacing:-.05em; }
  .channels em { margin-left:4px; font-size:9px; font-style:normal; opacity:.6; }
  meter { display:block; width:100%; height:3px; margin-top:12px; }
  footer { border-top:1px solid #d6ff7230; padding-top:16px; color:#f3f5ea; }
  footer div { display:grid; gap:3px; } footer b { font-size:12px; } footer strong { font-size:22px; }
  footer button { border:1px solid #d6ff7260; color:#d6ff72; background:transparent; padding:8px 10px; cursor:pointer; font:10px ui-monospace,monospace; }
  @media(max-width:600px){.channels{grid-template-columns:1fr 1fr}.channels strong{margin-top:15px}footer{align-items:center}}
</style>`
  },
  {
    id: 'synth',
    title: 'Pocket synth',
    kind: 'AUDIO',
    blurb: 'A polyphonic instrument built on the native Web Audio API. Skein binds keys, controls state and owns cleanup.',
    source: `<script>
  this.wave = 'sawtooth'
  this.notes = [
    { id:'c4', label:'C', key:'A', freq:261.63, active:false },
    { id:'d4', label:'D', key:'S', freq:293.66, active:false },
    { id:'e4', label:'E', key:'D', freq:329.63, active:false },
    { id:'f4', label:'F', key:'F', freq:349.23, active:false },
    { id:'g4', label:'G', key:'G', freq:392.00, active:false },
    { id:'a4', label:'A', key:'H', freq:440.00, active:false },
    { id:'b4', label:'B', key:'J', freq:493.88, active:false },
    { id:'c5', label:'C', key:'K', freq:523.25, active:false }
  ]
  this.playing = computed(() => this.notes.filter(note => note.active).map(note => note.label).join(' · ') || 'ready')
  let audio
  const voices = new Map()

  const context = () => audio ||= new AudioContext()
  const start = note => {
    if (!note || voices.has(note.id)) return
    const ctx = context()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = this.wave
    osc.frequency.value = note.freq
    gain.gain.setValueAtTime(.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(.18, ctx.currentTime + .018)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    voices.set(note.id, { osc, gain })
    note.active = true
  }
  const stop = note => {
    const voice = note && voices.get(note.id)
    if (!voice) return
    const now = audio.currentTime
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value,.0001), now)
    voice.gain.gain.exponentialRampToValueAtTime(.0001, now + .08)
    voice.osc.stop(now + .09)
    voices.delete(note.id)
    note.active = false
  }
  const byId = event => this.notes.find(note => note.id === event.currentTarget.dataset.id)
  this.down = event => { event.currentTarget.setPointerCapture?.(event.pointerId); start(byId(event)) }
  this.up = event => stop(byId(event))
  this.changeWave = event => this.wave = event.currentTarget.value

  window.addEventListener('keydown', event => {
    if (event.repeat) return
    start(this.notes.find(note => note.key === event.key.toUpperCase()))
  }, { signal:abortSignal })
  window.addEventListener('keyup', event => {
    stop(this.notes.find(note => note.key === event.key.toUpperCase()))
  }, { signal:abortSignal })
  onCleanup(() => {
    for (const note of this.notes) stop(note)
    audio?.close()
  })
<\/script>

<section class="synth">
  <header>
    <div><small>SKEIN / WEB AUDIO</small><h1>POLY–8</h1></div>
    <label>WAVE
      <select .value={wave} @change={changeWave}>
        <option value="sine">sine</option><option value="triangle">triangle</option>
        <option value="square">square</option><option value="sawtooth">sawtooth</option>
      </select>
    </label>
  </header>
  <div class="display"><i></i><span>{playing}</span></div>
  <div class="keys">
    <button for={notes} key={id} data-id={id} data-active={active}
      @pointerdown={down} @pointerup={up} @pointercancel={up} @pointerleave={up}>
      <kbd>{key}</kbd><strong>{label}</strong><small>{freq}</small>
    </button>
  </div>
  <p>play with pointer or A S D F G H J K</p>
</section>

<style>
  :host { display:block; height:100%; background:#d8ff58; color:#111; font-family:system-ui,sans-serif; }
  .synth { min-height:100%; padding:22px; box-sizing:border-box; background:linear-gradient(135deg,#eaff69,#c8ff43); }
  header { display:flex; justify-content:space-between; align-items:start; gap:20px; }
  header small { font:700 9px ui-monospace,monospace; letter-spacing:.14em; }
  h1 { margin:3px 0 0; font:900 clamp(36px,8vw,72px)/.8 Arial Black,sans-serif; letter-spacing:-.08em; }
  label { display:grid; gap:5px; font:700 9px ui-monospace,monospace; letter-spacing:.1em; }
  select { border:1px solid #111; background:transparent; padding:6px; }
  .display { margin:22px 0 12px; display:flex; align-items:center; gap:8px; padding:9px 11px; border:1px solid #111; font:11px ui-monospace,monospace; text-transform:uppercase; }
  .display i { width:7px; aspect-ratio:1; border-radius:50%; background:#ff4d37; box-shadow:0 0 14px #ff4d37; }
  .keys { display:grid; grid-template-columns:repeat(8,1fr); height:190px; border:2px solid #111; border-right:0; }
  .keys button { position:relative; min-width:0; border:0; border-right:2px solid #111; background:#f8f5e9; color:#111; cursor:pointer; touch-action:none; transition:transform 40ms,background 40ms; }
  .keys button[data-active="true"] { background:#ff5d49; transform:translateY(5px); }
  kbd { position:absolute; top:10px; left:50%; translate:-50% 0; font:700 9px ui-monospace,monospace; border:1px solid #111; border-radius:50%; width:22px; aspect-ratio:1; display:grid; place-items:center; }
  .keys strong { position:absolute; bottom:28px; left:0; right:0; font-size:22px; }
  .keys small { position:absolute; bottom:9px; left:0; right:0; font:8px ui-monospace,monospace; opacity:.45; }
  p { margin:10px 0 0; font:700 9px ui-monospace,monospace; letter-spacing:.08em; text-align:right; }
  @media(max-width:600px){.synth{padding:14px}.keys{height:160px}.keys strong{font-size:17px}.keys small{display:none}}
</style>`
  },
  {
    id: 'command',
    title: 'Command surface',
    kind: 'COMPUTED',
    blurb: 'Derived search results, conditional empty state and native input behavior with no template expressions.',
    source: `<script>
  this.query = ''
  this.commands = [
    { id:1, name:'Open project', group:'NAV', shortcut:'⌘ O' },
    { id:2, name:'Deploy preview', group:'SHIP', shortcut:'⌘ ↵' },
    { id:3, name:'Duplicate component', group:'EDIT', shortcut:'⌘ D' },
    { id:4, name:'Inspect signals', group:'DEV', shortcut:'⌥ S' },
    { id:5, name:'Export static HTML', group:'SHIP', shortcut:'⌘ E' }
  ]
  this.visible = computed(() => {
    const q = this.query.trim().toLowerCase()
    return q ? this.commands.filter(command => command.name.toLowerCase().includes(q)) : this.commands
  })
  this.empty = computed(() => this.visible.length === 0)
  this.count = computed(() => this.visible.length + ' commands')
  this.search = event => this.query = event.currentTarget.value
<\/script>

<section class="palette">
  <header><span>⌘</span><input autofocus placeholder="Type a command…" .value={query} @input={search}></header>
  <div class="count">{count}</div>
  <button for={visible} key={id}>
    <small>{group}</small><b>{name}</b><kbd>{shortcut}</kbd>
  </button>
  <div class="empty" if={empty}>Nothing matches “{query}”</div>
</section>

<style>
  :host { display:grid; place-items:center; height:100%; background:#7057ff; color:#151515; font-family:system-ui,sans-serif; }
  .palette { width:min(90%,520px); background:#f3efe5; border:2px solid #151515; box-shadow:12px 12px 0 #151515; }
  header { display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:center; padding:15px 16px; border-bottom:1px solid #aaa49a; }
  header span { display:grid; place-items:center; width:28px; aspect-ratio:1; border-radius:8px; background:#151515; color:white; font-size:13px; }
  input { width:100%; border:0; outline:0; background:transparent; font:600 18px system-ui; }
  .count { padding:9px 16px; color:#746f66; font:700 9px ui-monospace,monospace; text-transform:uppercase; letter-spacing:.12em; }
  button { width:100%; display:grid; grid-template-columns:55px 1fr auto; align-items:center; gap:10px; border:0; border-top:1px solid #d5d0c6; background:transparent; padding:13px 16px; text-align:left; cursor:pointer; }
  button:hover { background:#d8ff58; }
  button small { font:700 8px ui-monospace,monospace; color:#7057ff; } button b { font-size:14px; }
  kbd { font:10px ui-monospace,monospace; border:1px solid #aaa49a; border-radius:5px; padding:4px 6px; }
  .empty { padding:28px 16px; border-top:1px solid #d5d0c6; color:#746f66; font-size:13px; }
</style>`
  },
  {
    id: 'bezier',
    title: 'Bezier lab',
    kind: 'SVG',
    blurb: 'Sliders update computed geometry while Skein writes only the SVG path and control-point attributes that changed.',
    source: `<script>
  this.x1 = 72
  this.y1 = 30
  this.x2 = 248
  this.y2 = 190
  this.path = computed(() => 'M30 190 C' + this.x1 + ' ' + this.y1 + ' ' + this.x2 + ' ' + this.y2 + ' 290 30')
  this.css = computed(() => 'cubic-bezier(' + (this.x1/290).toFixed(2) + ',' + (1-this.y1/220).toFixed(2) + ',' + (this.x2/290).toFixed(2) + ',' + (1-this.y2/220).toFixed(2) + ')')
  this.change = event => this[event.currentTarget.name] = Number(event.currentTarget.value)
<\/script>

<section>
  <header><div><small>NATIVE SVG</small><h1>Bezier lab</h1></div><code>{css}</code></header>
  <svg viewBox="0 0 320 220">
    <path class="guide" d="M30 190 L72 30 M290 30 L248 190" />
    <path class="curve" d={path} />
    <circle cx={x1} cy={y1} r="8"/><circle cx={x2} cy={y2} r="8"/>
  </svg>
  <div class="sliders">
    <label>x1<input name="x1" type="range" min="30" max="150" .value={x1} @input={change}></label>
    <label>y1<input name="y1" type="range" min="20" max="200" .value={y1} @input={change}></label>
    <label>x2<input name="x2" type="range" min="170" max="290" .value={x2} @input={change}></label>
    <label>y2<input name="y2" type="range" min="20" max="200" .value={y2} @input={change}></label>
  </div>
</section>

<style>
  :host { display:block; height:100%; background:#f1ede2; color:#111; font-family:system-ui,sans-serif; }
  section { padding:20px; box-sizing:border-box; min-height:100%; }
  header { display:flex; justify-content:space-between; gap:20px; align-items:end; }
  small { font:700 9px ui-monospace,monospace; letter-spacing:.12em; color:#7158ff; }
  h1 { margin:2px 0 0; font-size:32px; letter-spacing:-.055em; }
  code { max-width:50%; text-align:right; font:9px ui-monospace,monospace; color:#7158ff; }
  svg { display:block; width:100%; height:220px; margin:5px 0; }
  .guide { fill:none; stroke:#999; stroke-width:1; stroke-dasharray:4 5; }
  .curve { fill:none; stroke:#111; stroke-width:5; stroke-linecap:round; }
  circle { fill:#d8ff58; stroke:#111; stroke-width:2; }
  .sliders { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  label { display:grid; gap:4px; font:700 8px ui-monospace,monospace; text-transform:uppercase; }
  input { width:100%; accent-color:#7158ff; }
</style>`
  }
]

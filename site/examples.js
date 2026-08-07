export const examples = [
  {
    id: 'signal-room',
    tag: 'signal-room',
    file: '../examples/signal/room.html',
    title: 'Signal room',
    kind: 'STATE',
    blurb: 'A live control room: deep reactive records update independently while keyed cards keep their DOM identity.'
  },
  {
    id: 'synth',
    tag: 'pocket-synth',
    file: '../examples/pocket/synth.html',
    title: 'Pocket synth',
    kind: 'AUDIO',
    blurb: 'A polyphonic instrument built on the native Web Audio API. Skein binds keys, controls state and owns cleanup.'
  },
  {
    id: 'command',
    tag: 'command-surface',
    file: '../examples/command/surface.html',
    title: 'Command surface',
    kind: 'COMPUTED',
    blurb: 'Derived search results, conditional empty state and native input behavior with no template expressions.'
  },
  {
    id: 'bezier',
    tag: 'bezier-lab',
    file: '../examples/bezier/lab.html',
    title: 'Bezier lab',
    kind: 'SVG',
    blurb: 'Sliders update computed geometry while Skein writes only the SVG path and control-point attributes that changed.'
  },
  {
    id: 'kinetic',
    tag: 'kinetic-type',
    file: '../examples/kinetic/type.html',
    title: 'Kinetic type',
    kind: 'CSS',
    blurb: 'Pointer-driven typography with reactive CSS custom properties. No render loop.'
  },
  {
    id: 'orbit',
    tag: 'svg-orbit',
    file: '../examples/svg/orbit.html',
    title: 'SVG orbit',
    kind: 'SVG',
    blurb: 'Only the circle coordinates change. The SVG tree is created once and stays native.'
  },
  {
    id: 'canvas',
    tag: 'canvas-field',
    file: '../examples/canvas/field.html',
    title: 'Canvas field',
    kind: 'CANVAS',
    blurb: 'Skein manages state and lifecycle; the Canvas API keeps doing exactly what it is good at.'
  },
  {
    id: 'identity',
    tag: 'dom-identity',
    file: '../examples/dom/identity.html',
    title: 'DOM identity',
    kind: 'KEYED',
    blurb: 'Reverse the data. Inputs, focus and custom elements stay alive because rows move instead of rerendering.'
  }
];

export const exampleById = id => examples.find(example => example.id === id) || examples[0];

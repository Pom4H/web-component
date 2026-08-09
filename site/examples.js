export const examples = [
  {
    id: 'counter',
    tag: 'hello-counter',
    file: '../examples/hello/counter.html',
    title: 'Hello Counter',
    kind: 'START',
    blurb: 'The smallest complete HTML component: native click events update one text binding and one fine-grained CSS custom property.',
    link: 'Edit in Playground →'
  },
  {
    id: 'queue',
    tag: 'queue-board',
    file: '../examples/queue/board.html',
    title: 'Queue Board',
    kind: 'KEYED',
    blurb: 'A plain HTML component whose editable rows keep browser-local input state while keyed DOM ranges reorder.',
    link: 'Edit in Playground →'
  },
  {
    id: 'atlas',
    tag: 'field-atlas',
    file: '../examples/field/atlas.html',
    title: 'Field Atlas',
    kind: 'SVG',
    blurb: 'An interactive native SVG network where list-scoped nodes stay intact and pointer state updates only exact attributes.',
    link: 'Edit in Playground →'
  },
  {
    id: 'type',
    tag: 'type-machine',
    file: '../examples/type/machine.html',
    title: 'Type Machine',
    kind: 'CSS',
    blurb: 'Reactive form state updates four CSS custom properties while native CSS owns layout, transforms and typography.',
    link: 'Edit in Playground →'
  }
];

export const exampleById = id => examples.find(example => example.id === id) || examples[0];

export const examples = [
  {
    id: 'counter',
    tag: 'hello-counter',
    file: '../examples/hello/counter.html',
    title: 'Hello Counter',
    kind: 'START',
    blurb: 'A first reactive component: two native click handlers update one text binding and one fine-grained CSS custom property.',
    link: 'Edit in Playground →'
  },
  {
    id: 'queue',
    tag: 'queue-board',
    file: '../examples/queue/board.html',
    title: 'Queue Board',
    kind: 'KEYED',
    blurb: 'Editable rows keep their browser-local input state while the underlying records reorder through keyed DOM identity.',
    link: 'Edit in Playground →'
  },
  {
    id: 'atlas',
    tag: 'field-atlas',
    file: '../examples/field/atlas.html',
    title: 'Field Atlas',
    kind: 'SVG',
    blurb: 'A real SVG network where list-scoped nodes stay intact and pointer state updates only exact line and cursor attributes.',
    link: 'Edit in Playground →'
  },
  {
    id: 'type',
    tag: 'type-machine',
    file: '../examples/type/machine.html',
    title: 'Type Machine',
    kind: 'CSS',
    blurb: 'Reactive form state updates four independent CSS custom properties, leaving layout, transforms and typography to native CSS.',
    link: 'Edit in Playground →'
  }
];

export const exampleById = id => examples.find(example => example.id === id) || examples[0];

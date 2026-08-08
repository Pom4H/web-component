export const examples = [
  {
    id: 'queue',
    tag: 'queue-board',
    file: '../examples/queue/board.html',
    title: 'Queue Board',
    kind: 'KEYED',
    blurb: 'Editable rows keep their browser-local input state while the underlying records reorder through keyed DOM identity.'
  },
  {
    id: 'atlas',
    tag: 'field-atlas',
    file: '../examples/field/atlas.html',
    title: 'Field Atlas',
    kind: 'SVG',
    blurb: 'A real SVG network where list-scoped nodes stay intact and pointer state updates only exact line and cursor attributes.'
  },
  {
    id: 'type',
    tag: 'type-machine',
    file: '../examples/type/machine.html',
    title: 'Type Machine',
    kind: 'CSS',
    blurb: 'Reactive form state collapses into CSS custom properties, leaving layout, transforms and typography to native CSS.'
  }
];

export const exampleById = id => examples.find(example => example.id === id) || examples[0];

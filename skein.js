import { Runtime, SkeinElement, defineElement, registerComponent } from './runtime/component.js';

export const Skein = Object.assign(Runtime, {
  name: 'Skein',
  version: '0.4.0',
  Element: SkeinElement,
  define: registerComponent,
  element: defineElement,
});

SkeinElement.runtime = Skein;
window.Skein = Skein;

const bootstrap = () => {
  if (typeof document?.querySelectorAll !== 'function') return;

  for (const template of document.querySelectorAll('template[skein]')) {
    const tag = template.getAttribute('skein')?.trim();
    if (!tag) continue;
    registerComponent(tag, template.innerHTML);
    template.remove();
  }

  for (const element of document.querySelectorAll('*')) {
    if (element.localName?.includes('-')) defineElement(element.localName);
  }
};

// Defer automatic discovery by one task. This lets dynamic-import callers
// register source with Skein.define() before unknown custom tags are auto-loaded.
setTimeout(bootstrap, 0);

export { SkeinElement, defineElement, registerComponent };

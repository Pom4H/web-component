import { Runtime, WebComponent, defineElement, registerComponent } from './runtime/component.js';

export const Skein = Object.assign(Runtime, {
  name: 'Skein',
  version: '0.3.0',
  Element: WebComponent,
  define: registerComponent,
  element: defineElement,
});

WebComponent.runtime = Skein;
window.Skein = Skein;
window.WebComponent = WebComponent;
window.WebComponentRuntime = Skein;

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

queueMicrotask(bootstrap);

export { WebComponent, defineElement, registerComponent };

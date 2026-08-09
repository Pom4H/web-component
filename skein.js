import { registerComponent, loadElement } from './runtime/component.js';

export const Skein = {
  version: '0.6.0',
  define: registerComponent,
};

window.Skein = Skein;

const bootstrap = () => {
  for (const template of document.querySelectorAll('template[skein]')) {
    const tag = template.getAttribute('skein')?.trim();
    if (tag) registerComponent(tag, template.innerHTML);
    template.remove();
  }
  for (const element of document.querySelectorAll(':not(:defined)')) {
    if (element.localName.includes('-')) loadElement(element.localName);
  }
};

setTimeout(bootstrap, 0);

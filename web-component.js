import { Runtime, WebComponent, defineElement } from './runtime/component.js';

WebComponent.runtime = Runtime;
window.WebComponent = WebComponent;
window.WebComponentRuntime = Runtime;

for (const element of document.body.children) {
  if (element.localName?.includes('-')) defineElement(element.localName);
}

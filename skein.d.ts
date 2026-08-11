export type SkeinTagName = `${string}-${string}`;

export interface SkeinAPI {
  readonly version: string;
  define(tag: SkeinTagName, source: string): CustomElementConstructor;
}

export interface SkeinHost<State extends object = Record<string, unknown>> extends HTMLElement {
  state: State;
  readonly shadowRoot: ShadowRoot;
  dispose(): void;
}

export declare const Skein: SkeinAPI;

declare global {
  interface Window {
    Skein: SkeinAPI;
  }

  var Skein: SkeinAPI;
}

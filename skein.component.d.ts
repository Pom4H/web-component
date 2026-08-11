import type { SkeinHost } from './skein.js';

export interface SkeinComputed<T> {
  get(): T;
  dispose(): void;
}

export interface SkeinEffect {
  dispose(): void;
}

declare global {
  function input(name: string): undefined;
  function input<T>(name: string, fallback: T): T;

  function computed<T>(callback: () => T): SkeinComputed<T>;
  function effect(callback: () => void): SkeinEffect;
  function onCleanup(callback: () => void): void;

  const host: SkeinHost;
  const abortSignal: AbortSignal;
}

export {};

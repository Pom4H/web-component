/// <reference path="../skein.component.d.ts" />

import { Skein, type SkeinTagName } from '../skein.js';

const tag: SkeinTagName = 'demo-card';
Skein.define(tag, '<slot></slot>');
Skein.version satisfies string;
window.Skein.define('window-card', '<slot></slot>');

// @ts-expect-error Skein custom-element names must contain a hyphen.
Skein.define('counter', '<slot></slot>');

const label = input('label', 'Metric');
label satisfies string;

const optionalLabel = input('label');
optionalLabel satisfies string | undefined;

const doubled = computed(() => 2);
doubled.get() satisfies number;
doubled.dispose();

const watcher = effect(() => {});
watcher.dispose();

onCleanup(() => {});
host.dispose();
abortSignal.aborted satisfies boolean;

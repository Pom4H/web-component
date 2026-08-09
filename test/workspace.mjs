import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const which = command => {
  const { spawnSync } = requireChildProcess();
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { encoding:'utf8' }).stdout.trim().split(/\r?\n/)[0];
};
function requireChildProcess() {
  return { spawnSync: (command, args, options) => {
    const result = BunLikeSpawnSync(command, args, options);
    return result;
  }};
}
function BunLikeSpawnSync(command, args, options) {
  // Kept local so this file has no dependencies beyond Node built-ins.
  return globalThis.__skeinSpawnSync(command, args, options);
}

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Chalk } from '../../build/index.js';

delete process.env.FORCE_COLOR;
delete process.env.NO_COLOR;
delete process.env.NODE_DISABLE_COLORS;

export const BUILD = path.resolve(import.meta.dirname, '../../build/index.js');
export const tick = () => new Promise(resolve => setImmediate(resolve));
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));


/** A fake stream that records everything written to it. */
export function memoryStream({ isTTY = true, colorDepth } = {}) {
  const writes = [];
  return {
    isTTY,
    writes,
    ...(colorDepth && { getColorDepth: () => colorDepth }),
    write(chunk) {
      writes.push(chunk);
      return true;
    },
    get output() {
      return writes.join('');
    },
    get lines() {
      return this.output.split('\n').filter(Boolean);
    },
  };
}

/** A logger that writes to a memory stream. */
export function createLogger({ stream: streamOptions, ...options } = {}) {
  const stream = memoryStream(streamOptions);
  const logger = new Chalk({ colors: false, timestamps: false, ...options, console: { stream, ...options.console } });
  return { logger, stream };
}

/** Parses the JSON lines written to a stream. */
export function jsonLines(stream) {
  return stream.lines.map(line => JSON.parse(line));
}

/** A transport that keeps every record it gets. */
export function memoryTransport(options = {}) {
  const records = [];
  return { records, write: (record) => records.push(record), ...options };
}

export function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chalk-${prefix}-`));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Runs an ES module script in a separate Node.js process, with the build available as `chalk`. */
export function runScript(code, { env } = {}) {
  const source = `import * as chalk from ${JSON.stringify(BUILD)};\n${code}`;
  return spawnSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', source], { encoding: 'utf8', env: { ...process.env, ...env } });
}

/** Returns the process warnings emitted while `fn` runs. */
export async function captureWarnings(fn) {
  const warnings = [];
  const listener = (warning) => warnings.push(warning);
  process.on('warning', listener);
  try {
    await fn();
    await tick();
  } finally {
    process.off('warning', listener);
  }
  return warnings;
}

/** Swaps `fetch` for a fake that answers with `respond(request)`. Call `restore()` to undo it. */
export function mockFetch(respond = () => new Response(null, { status: 204 })) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const request = { url: String(url), init, body: JSON.parse(init.body) };
    requests.push(request);
    return respond(request, requests.length);
  };
  return { requests, restore: () => { globalThis.fetch = original; } };
}

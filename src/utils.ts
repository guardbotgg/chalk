import { ColorInput, ColorName } from './types';
import { Palette } from './constants';
import fs from 'node:fs/promises';
import util from 'node:util';


// Transports
export function stripAnsi(str: string) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

const fileQueues = new Map<string, Promise<unknown>>();
export function appendFile(file: string, content: string) {
  const prev = fileQueues.get(file) ?? Promise.resolve();
  
  const next = prev
    .then(() => fs.appendFile(file, stripAnsi(content) + '\n'))
    .catch(() => {});

  fileQueues.set(file, next);
  return next;
}

const _fetch: typeof fetch = globalThis.fetch;
const webhookQueues = new Map<string, Promise<unknown>>();
export function sendWebhook(webhook: string, content: string) {
  const prev = webhookQueues.get(webhook) ?? Promise.resolve();
  
  const next = prev
    .then(() =>
      _fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `\`\`\`\n${stripAnsi(content).slice(0, 4000)}\n\`\`\``,
        }),
      })
    )
    .catch(() => {});

  webhookQueues.set(webhook, next);
  return next;
}


// Color Utilities
export function parseColor(input: ColorInput): [number, number, number] {
  if (Array.isArray(input)) return input;

  if (typeof input === 'string') {
    if (input.startsWith('#')) {
      let hex = input.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const bigint = parseInt(hex, 16);
      return [
        (bigint >> 16) & 255,
        (bigint >> 8) & 255,
        bigint & 255,
      ];
    }

    if (input.startsWith('rgb')) {
      const nums = input.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
      return [nums[0], nums[1], nums[2]];
    }

    return Palette[input as ColorName] ?? [255, 255, 255];
  }

  return [255, 255, 255];
}

export function colorize(input: ColorInput, useColors: boolean = true, bold: boolean = false) {
  if (!useColors) return (t: string) => t;
  const [r, g, b] = parseColor(input);
  return (txt: string) => `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m${txt}\x1b[0m`;
}


// Formatters
export function prettyError(err: Error) {
  const stack = err.stack?.split('\n').slice(1).join('\n');
  return `\n└─ ${err.name}: ${err.message}\n${stack}`;
}

export function formatArg(arg: any, useColors: boolean = true): string {
  if (arg instanceof Error) return prettyError(arg);
  if (typeof arg === 'object') {
    return util.inspect(arg, { depth: 3, colors: useColors,  });
  }
  return String(arg);
}
import { colorize } from './colors';
import util from 'node:util';


export function stripAnsi(str: string): string {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};


export function prettyError(err: Error, useColors: boolean = true): string {
  const stack = err.stack?.split('\n').slice(1).join('\n') ?? '';
  return `\n${colorize('red', useColors, true)(`└─ ${err.name}:`)} ${err.message}\n${stack}`;
};


export function formatArg(arg: any, useColors: boolean = true): string {
  if (arg instanceof Error) return prettyError(arg, useColors);
  if (typeof arg === 'object' && arg !== null) {
    return util.inspect(arg, { depth: 4, colors: useColors, compact: false });
  }
  return String(arg);
};
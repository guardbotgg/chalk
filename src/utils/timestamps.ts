import type { TimestampOption, TimestampStyle } from '../types';
import { ChalkError } from '../core/ChalkError';


export type TimestampFormatter = (time: number) => string;

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const MILLISECONDS = Array.from({ length: 1000 }, (_, ms) => `${ms}`.padStart(3, '0'));

const prefixes: Record<TimestampStyle, (date: Date) => string> = {
  datetime: (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${prefixes.time(date)}`,
  time: (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.`,
  iso: (date) => date.toISOString().slice(0, 20),
};


export function createTimestampFormatter(option: TimestampOption | undefined, name = 'timestamps'): TimestampFormatter | undefined {
  if (option === false) return undefined;
  if (typeof option === 'function') return cacheCustom(option);
  if (option === undefined || option === true) return cacheStyle('datetime');
  if (typeof option === 'string' && Object.hasOwn(prefixes, option)) return cacheStyle(option);
  throw new ChalkError('InvalidOption', name, 'a boolean, "datetime", "time", "iso" or a function', option);
}

function cacheStyle(style: TimestampStyle): TimestampFormatter {
  const format = prefixes[style];
  const suffix = style === 'iso' ? 'Z' : '';
  let second = NaN;
  let prefix = '';
  return (time) => {
    const current = Math.floor(time / 1000);
    if (current !== second) {
      second = current;
      prefix = format(new Date(time));
    }
    return prefix + MILLISECONDS[time - current * 1000] + suffix;
  };
}

function cacheCustom(format: (date: Date) => string): TimestampFormatter {
  let last = NaN;
  let cached = '';
  return (time) => {
    if (time !== last) {
      last = time;
      try {
        cached = String(format(new Date(time)));
      } catch {
        cached = new Date(time).toISOString();
      }
    }
    return cached;
  };
}

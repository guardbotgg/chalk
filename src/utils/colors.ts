import type { ColorName, OutputStream } from '../types';
import { ChalkError } from '../core/ChalkError';


export type RGB = readonly [number, number, number];
export type ColorLevel = 0 | 1 | 2 | 3;

export interface Style {
  readonly open: string;
  readonly close: string;
}

export const NO_STYLE: Style = Object.freeze({ open: '', close: '' });

/** The built-in colors, as `[r, g, b]`. */
export const ColorPalette: Readonly<Record<ColorName, RGB>> = deepFreeze({
  red: [238, 98, 130],
  orange: [255, 180, 130],
  yellow: [233, 226, 134],
  green: [109, 230, 156],
  cyan: [163, 247, 209],
  blue: [122, 172, 255],
  purple: [175, 164, 255],
  violet: [192, 167, 235],
  sky: [153, 189, 238],
  pink: [255, 149, 167],
  peach: [246, 195, 160],
  grey: [237, 242, 251],
});


export const LabelColors: Readonly<Record<string, ColorName>> = Object.freeze({
  trace: 'grey',
  debug: 'violet',
  info: 'blue',
  success: 'green',
  warn: 'orange',
  error: 'red',
  fatal: 'red',
  api: 'sky',
  ws: 'purple',
  cron: 'peach',
  performance: 'violet',
  database: 'violet',
  redis: 'violet',
  cluster: 'cyan',
  shard: 'blue',
  connected: 'green',
  disconnected: 'red',
  client: 'orange',
  manager: 'sky',
  command: 'purple',
  listener: 'yellow',
});

const parsed = new Map<string, RGB | null>();

function deepFreeze<T extends Record<string, readonly number[]>>(palette: T): Readonly<T> {
  for (const rgb of Object.values(palette)) Object.freeze(rgb);
  return Object.freeze(palette);
}


export function parseColor(input: unknown): RGB | undefined {
  if (Array.isArray(input)) return isChannels(input) ? [input[0], input[1], input[2]] : undefined;
  if (typeof input !== 'string') return undefined;

  let rgb = parsed.get(input);
  if (rgb === undefined) {
    rgb = parseColorString(input.trim().toLowerCase());
    if (parsed.size < 512) parsed.set(input, rgb);
  }
  return rgb ?? undefined;
}

export function toRGB(input: unknown, name: string): RGB {
  const rgb = parseColor(input);
  if (!rgb) throw new ChalkError('InvalidColor', name, input);
  return rgb;
}

function parseColorString(value: string): RGB | null {
  if (Object.hasOwn(ColorPalette, value)) return ColorPalette[value as ColorName];

  const hex = /^#([\da-f]{3}|[\da-f]{6})$/.exec(value)?.[1];
  if (hex) {
    const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (rgb) {
    const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] as const;
    return isChannels(channels) ? channels : null;
  }
  return null;
}

function isChannels(value: readonly unknown[]): value is RGB {
  return value.length === 3 && value.every(c => Number.isInteger(c) && (c as number) >= 0 && (c as number) <= 255);
}


export function createStyle(rgb: RGB | undefined, level: ColorLevel, attributes: { bold?: boolean; dim?: boolean; inverse?: boolean } = {}): Style {
  if (level === 0) return NO_STYLE;
  let open = '';
  let close = '';
  if (attributes.bold) open += '\x1b[1m';
  if (attributes.dim) open += '\x1b[2m';
  if (attributes.bold || attributes.dim) close = '\x1b[22m';
  if (attributes.inverse) {
    open += '\x1b[7m';
    close = '\x1b[27m' + close;
  }
  if (rgb) {
    open += foreground(rgb, level);
    close = '\x1b[39m' + close;
  }
  return { open, close };
}

export function paint(text: string, style: Style): string {
  if (!style.open || !text) return text;
  if (text.includes('\x1b')) text = text.replace(/\x1b\[(?:0|22|27|39)?m/g, `$&${style.open}`);
  return style.open + text + style.close;
}

function foreground([r, g, b]: RGB, level: ColorLevel): string {
  switch (level) {
    case 3: return `\x1b[38;2;${r};${g};${b}m`;
    case 2: return `\x1b[38;5;${toAnsi256(r, g, b)}m`;
    case 1: return `\x1b[${toAnsi16(r, g, b)}m`;
    default: return '';
  }
}

function toAnsi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const cube = (channel: number) => Math.round((channel / 255) * 5);
  return 16 + 36 * cube(r) + 6 * cube(g) + cube(b);
}

function toAnsi16(r: number, g: number, b: number): number {
  const brightness = Math.round((Math.max(r, g, b) / 255) * 2);
  if (brightness === 0) return 30;
  const code = 30 + ((Math.round(b / 255) << 2) | (Math.round(g / 255) << 1) | Math.round(r / 255));
  return brightness === 2 ? code + 60 : code;
}

export function toInteger([r, g, b]: RGB): number {
  return (r << 16) | (g << 8) | b;
}


export function detectColorLevel(stream: OutputStream, env: NodeJS.ProcessEnv = process.env): ColorLevel {
  const forced = forcedLevel(env.FORCE_COLOR);
  if (forced === 0) return 0;
  if (forced === undefined && (env.NO_COLOR || env.NODE_DISABLE_COLORS)) return 0;

  const supported = stream.isTTY ? terminalLevel(stream, env) : 0;
  return forced === undefined ? supported : (Math.max(forced, supported) as ColorLevel);
}

export function resolveColorLevel(option: boolean | undefined, stream: OutputStream): ColorLevel {
  if (option === false) return 0;
  const level = detectColorLevel(stream);
  return option === true && level === 0 ? 3 : level;
}

function terminalLevel(stream: OutputStream, env: NodeJS.ProcessEnv): ColorLevel {
  const { getColorDepth } = stream as { getColorDepth?: (env?: object) => number };
  if (typeof getColorDepth !== 'function') return 1;
  const terminalEnv = { ...env };
  delete terminalEnv.FORCE_COLOR;
  delete terminalEnv.NO_COLOR;
  delete terminalEnv.NODE_DISABLE_COLORS;
  const depth = getColorDepth.call(stream, terminalEnv);
  return depth >= 24 ? 3 : depth >= 8 ? 2 : depth >= 4 ? 1 : 0;
}

function forcedLevel(value: string | undefined): ColorLevel | undefined {
  if (value === undefined) return undefined;
  if (value === '' || value === 'true') return 1;
  if (value === 'false') return 0;
  const level = Number(value);
  return Number.isInteger(level) ? (Math.min(Math.max(level, 0), 3) as ColorLevel) : undefined;
}

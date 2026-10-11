import { ColorPalette, createStyle, LabelColors, paint, type ColorLevel, type Style } from '../utils/colors';
import { extraProperties, isError, safeText, stringify } from '../utils/serialize';
import { inspect, stripVTControlCharacters, type InspectOptions } from 'node:util';
import type { TimestampFormatter } from '../utils/timestamps';
import type { Entry, Scope } from '../core/Entry';
import type { Fields, LogType } from '../types';


export interface PrettyFormatterOptions {
  colors: ColorLevel;
  timestamp?: TimestampFormatter;
}

interface ScopeParts {
  prefixes: Readonly<Record<LogType, string>>;
  fields: string;
}

const LEVEL_TYPES = ['trace', 'debug', 'info', 'success', 'warn', 'error', 'fatal'] as const;
const MAX_ERROR_DEPTH = 8;


export class PrettyFormatter {
  readonly #colors: ColorLevel;
  readonly #timestamp?: TimestampFormatter;
  readonly #timestampOpen: string;
  readonly #timestampClose: string;
  readonly #inspectOptions: InspectOptions;
  readonly #errorStyle: Style;
  readonly #dim: Style;

  constructor(options: PrettyFormatterOptions) {
    this.#colors = options.colors;
    this.#timestamp = options.timestamp;
    this.#dim = createStyle(undefined, this.#colors, { dim: true });
    this.#timestampOpen = `${this.#dim.open}[`;
    this.#timestampClose = `]${this.#dim.close} `;
    this.#inspectOptions = { colors: this.#colors > 0, depth: 4, breakLength: 100 };
    this.#errorStyle = createStyle(ColorPalette[LabelColors.error], this.#colors, { bold: true });
  }

  format(entry: Entry): string {
    const parts = entry.scope.cached(this, this.#buildScopeParts);
    const timestamp = this.#timestamp ? this.#timestampOpen + this.#timestamp(entry.time) + this.#timestampClose : '';
    return `${timestamp}${parts.prefixes[entry.type]}${this.body(entry)}\n`;
  }

  body(entry: Entry): string {
    try {
      return this.#plain(this.#body(entry.args, entry.scope.cached(this, this.#buildScopeParts).fields));
    } catch {
      return this.#plain(entry.args.map(safeText).join(' '));
    }
  }

  #inspect(value: unknown): string {
    const colored = this.#colors > 0;
    switch (typeof value) {
      case 'number': return style(Object.is(value, -0) ? '-0' : `${value}`, colored, 33, 39);
      case 'bigint': return style(`${value}n`, colored, 33, 39);
      case 'boolean': return style(`${value}`, colored, 33, 39);
      case 'undefined': return style('undefined', colored, 90, 39);
      default: return value === null ? style('null', colored, 1, 22) : inspect(value, this.#inspectOptions);
    }
  }

  #plain(text: string): string {
    return this.#colors === 0 && text.includes('\x1b') ? stripVTControlCharacters(text) : text;
  }

  #body(args: readonly unknown[], fields: string): string {
    if (args.length === 1 && typeof args[0] === 'string') return args[0] + fields;

    let text = '';
    let errors: Error[] | undefined;
    for (const arg of args) {
      if (isError(arg)) {
        (errors ??= []).push(arg);
        continue;
      }
      const part = typeof arg === 'string' ? arg : this.#inspect(arg);
      text = text ? `${text} ${part}` : part;
    }
    if (!errors) return text + fields;

    let details = '';
    const seen = new Set<unknown>();
    for (const [i, error] of errors.entries()) {
      if (i === 0 && !text) {
        seen.add(error);
        text = this.#errorHeader(error, '   ');
        details = this.#errorDetails(error, '', seen, 0);
      } else {
        details += this.#errorBlock(error, '', '', seen, 0);
      }
    }
    return text + fields + details;
  }


  #errorBlock(error: Error, indent: string, label: string, seen: Set<unknown>, depth: number, parentFrames?: readonly string[]): string {
    if (seen.has(error)) return `\n${indent}${paint('└─', this.#errorStyle)} ${label}[Circular]`;
    seen.add(error);
    const header = this.#errorHeader(error, `${indent}   `);
    return `\n${indent}${paint('└─', this.#errorStyle)} ${label}${header}${this.#errorDetails(error, indent, seen, depth, parentFrames)}`;
  }

  #errorHeader(error: Error, indent: string): string {
    const name = paint(String(error.name || 'Error'), this.#errorStyle);
    const message = String(error.message ?? '');
    return message ? `${name}: ${message.replaceAll('\n', `\n${indent}`)}` : name;
  }

  #errorDetails(error: Error, indent: string, seen: Set<unknown>, depth: number, parentFrames?: readonly string[]): string {
    const inner = `${indent}    `;
    let details = '';

    const extra = extraProperties(error);
    if (extra) details += `\n${inner}${inspect(extra, { ...this.#inspectOptions, depth: 2 }).replaceAll('\n', `\n${inner}`)}`;

    const frames = stackFrames(error.stack);
    const shared = parentFrames ? sharedFrames(frames, parentFrames) : 0;
    for (let i = 0; i < frames.length - shared; i++) {
      const frame = frames[i];
      details += `\n${inner}${frame.includes('node_modules') || frame.includes('(node:') || frame.startsWith('at node:') ? paint(frame, this.#dim) : frame}`;
    }
    if (shared > 0) details += `\n${inner}${paint(`… ${shared} more, as above`, this.#dim)}`;

    if (depth >= MAX_ERROR_DEPTH) return details;
    const nested = `${indent}   `;
    const { cause } = error;
    if (isError(cause)) details += this.#errorBlock(cause, nested, 'Caused by: ', seen, depth + 1, frames);
    else if (cause !== undefined) details += `\n${nested}${paint('└─', this.#errorStyle)} Caused by: ${inspect(cause, this.#inspectOptions)}`;

    const errors = (error as { errors?: unknown }).errors;
    if (Array.isArray(errors)) {
      for (const member of errors) {
        details += isError(member)
          ? this.#errorBlock(member, nested, '', seen, depth + 1, frames)
          : `\n${nested}${paint('└─', this.#errorStyle)} ${inspect(member, this.#inspectOptions)}`;
      }
    }
    return details;
  }


  #buildScopeParts = (scope: Scope): ScopeParts => {
    const labels = scope.labels.map(label => paint(`[${label.name.toUpperCase()}]`, createStyle(label.color, this.#colors, { bold: true })) + ' ').join('');
    const prefixes = { log: labels } as Record<LogType, string>;
    for (const type of LEVEL_TYPES) {
      const style = createStyle(ColorPalette[LabelColors[type]], this.#colors, { bold: type !== 'trace', dim: type === 'trace', inverse: type === 'fatal' });
      prefixes[type] = `${labels}${paint(`[${type.toUpperCase()}]`, style)} `;
    }
    return { prefixes, fields: scope.fields ? paint(formatFields(scope.fields), this.#dim) : '' };
  };
}


function style(text: string, colored: boolean, open: number, close: number): string {
  return colored ? `\x1b[${open}m${text}\x1b[${close}m` : text;
}

function stackFrames(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const frame = line.trim();
    if (frame.startsWith('at ')) frames.push(frame);
  }
  return frames;
}

function sharedFrames(frames: readonly string[], parentFrames: readonly string[]): number {
  let shared = 0;
  while (
    shared < frames.length - 1 && shared < parentFrames.length
    && frames[frames.length - 1 - shared] === parentFrames[parentFrames.length - 1 - shared]
  ) shared++;
  return shared;
}

function formatFields(fields: Readonly<Fields>): string {
  let text = '';
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const formatted = typeof value === 'string' && /^[\w.:/@#-]+$/.test(value) ? value : stringify(value);
    text += ` ${key}=${formatted}`;
  }
  return text;
}

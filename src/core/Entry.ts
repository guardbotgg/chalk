import type { ColorInput, Fields, Labels, LogRecord, LogType } from '../types';
import { ColorPalette, LabelColors, toRGB, type RGB } from '../utils/colors';
import { isError, isPlainObject, safeText } from '../utils/serialize';
import { inspect, stripVTControlCharacters } from 'node:util';
import { TypeLevel } from './Levels';


export interface Label {
  readonly name: string;
  readonly color: RGB;
}

export interface Parts {
  message: string;
  error: Error | undefined;
  objects: Record<string, unknown>[] | undefined;
}

const EMPTY: Readonly<Fields> = Object.freeze({});
const INLINE = { colors: false, depth: 4, breakLength: Infinity } as const;


export class Scope {
  readonly names: readonly string[];
  #cache: unknown[] = [];

  constructor(readonly labels: readonly Label[], readonly fields: Readonly<Fields> | undefined) {
    this.names = Object.freeze(labels.map(label => label.name));
  }

  static create(labels: Labels | undefined, fields: Fields | undefined): Scope {
    return new Scope([], fields && { ...fields }).withLabels(labels ?? {});
  }

  cached<T>(owner: object, build: (scope: Scope) => T): T {
    const cache = this.#cache;
    for (let i = 0; i < cache.length; i += 2) {
      if (cache[i] === owner) return cache[i + 1] as T;
    }
    const value = build(this);
    cache.push(owner, value);
    return value;
  }

  withLabels(changes: Record<string, ColorInput | boolean>, optionName = 'labels'): Scope {
    const labels = new Map(this.labels.map(label => [label.name, label.color]));
    for (const [name, color] of Object.entries(changes)) {
      if (color === false) labels.delete(name);
      else labels.set(name, labelColor(name, color, `${optionName}.${name}`));
    }
    return new Scope(Array.from(labels, ([name, color]) => ({ name, color })), this.fields);
  }

  withFields(fields: Fields): Scope {
    return new Scope(this.labels, { ...this.fields, ...fields });
  }
}


export class Entry implements LogRecord {
  #parts?: Parts;
  #fields?: Readonly<Fields>;

  constructor(
    readonly type: LogType,
    readonly severity: number,
    readonly time: number,
    readonly args: readonly unknown[],
    readonly scope: Scope,
    readonly extra?: Readonly<Fields>,
    readonly summary?: string,
  ) {}

  get level() {
    return TypeLevel[this.type];
  }

  get labels() {
    return this.scope.names;
  }

  get message() {
    return this.summary ?? this.parts.message;
  }

  get error() {
    return this.parts.error;
  }

  get fields(): Readonly<Fields> {
    return this.#fields ??= this.#mergeFields();
  }

  get parts(): Parts {
    return this.#parts ??= analyze(this.args);
  }

  #mergeFields(): Readonly<Fields> {
    const { objects } = this.parts;
    if (!objects && !this.extra) return this.scope.fields ?? EMPTY;
    const sources = [...(objects ?? []), this.extra ?? EMPTY];
    try {
      return sources.reduce<Fields>((fields, source) => ({ ...fields, ...source }), { ...this.scope.fields });
    } catch {
      const fields: Fields = { ...this.scope.fields };
      for (const source of sources) {
        for (const key of Object.keys(source)) {
          try {
            fields[key] = source[key];
          } catch {
            fields[key] = '[Unreadable]';
          }
        }
      }
      return fields;
    }
  }
}


function labelColor(name: string, color: ColorInput | true, optionName: string): RGB {
  if (color !== true) return toRGB(color, optionName);
  const key = name.toLowerCase();
  return ColorPalette[Object.hasOwn(LabelColors, key) ? LabelColors[key] : 'grey'];
}

function analyze(args: readonly unknown[]): Parts {
  let message = '';
  let error: Error | undefined;
  let objects: Record<string, unknown>[] | undefined;

  for (const arg of args) {
    let text: string;
    try {
      if (typeof arg === 'string') {
        text = arg;
      } else if (typeof arg === 'object' && arg !== null) {
        if (isPlainObject(arg)) {
          (objects ??= []).push(arg);
          continue;
        }
        if (isError(arg)) {
          if (!error) {
            error = arg;
            continue;
          }
          text = `${arg.name}: ${arg.message}`;
        } else {
          text = inspect(arg, INLINE);
        }
      } else {
        text = typeof arg === 'function' ? inspect(arg) : String(arg);
      }
    } catch {
      text = safeText(arg);
    }
    message = message ? `${message} ${text}` : text;
  }

  if (!message && error) message = safeText(error.message);
  if (message.includes('\x1b')) message = stripVTControlCharacters(message);
  return { message, error, objects };
}

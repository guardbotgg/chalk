import { inspect, types } from 'node:util';


export interface SerializedError {
  type: string;
  message: string;
  stack?: string;
  cause?: unknown;
  errors?: unknown[];
  [key: string]: unknown;
}

export function describeError(error: unknown): string {
  try {
    return isError(error) ? String(error.stack ?? error) : inspect(error);
  } catch {
    return 'an error that can\'t be described';
  }
}

export function safeText(value: unknown): string {
  try {
    return typeof value === 'string' ? value : inspect(value, { colors: false, depth: 2, breakLength: Infinity });
  } catch {
    return '[uninspectable]';
  }
}

export function isError(value: unknown): value is Error {
  return value instanceof Error || types.isNativeError(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function extraProperties(error: Error): Record<string, unknown> | undefined {
  let extra: Record<string, unknown> | undefined;
  for (const key of Object.keys(error)) {
    if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause' || key === 'errors') continue;
    const value = (error as unknown as Record<string, unknown>)[key];
    if (value !== undefined && typeof value !== 'function') (extra ??= {})[key] = value;
  }
  return extra;
}


export function serializeError(error: Error, seen = new Set<unknown>()): SerializedError {
  seen.add(error);
  const serialized: SerializedError = {
    type: typeof error.constructor === 'function' && error.constructor.name ? error.constructor.name : String(error.name),
    message: String(error.message),
  };
  if (typeof error.stack === 'string') serialized.stack = error.stack;

  const extra = extraProperties(error);
  if (extra) for (const key in extra) serialized[key] = serializeNested(extra[key], seen);
  if (error.cause !== undefined) serialized.cause = serializeNested(error.cause, seen);
  const errors = (error as { errors?: unknown }).errors;
  if (Array.isArray(errors)) serialized.errors = errors.map(inner => serializeNested(inner, seen));
  return serialized;
}

function serializeNested(value: unknown, seen: Set<unknown>): unknown {
  if (!isError(value)) return value;
  return seen.has(value) ? '[Circular]' : serializeError(value, seen);
}


export function quote(text: string): string {
  if (text.length > 64) return JSON.stringify(text);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 34 || code === 92 || (code >= 0xd800 && code <= 0xdfff)) return JSON.stringify(text);
  }
  return `"${text}"`;
}

function isFlat(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  for (const key in value) {
    const field = value[key];
    const type = typeof field;
    if (field !== null && type !== 'string' && type !== 'number' && type !== 'boolean' && type !== 'undefined') return false;
  }
  return true;
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || value === null) return value;
  if (isError(value)) return serializeError(value);
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  return value;
}

function circularReplacer() {
  const ancestors: unknown[] = [];
  return function (this: unknown, key: string, value: unknown): unknown {
    value = replacer(key, value);
    if (typeof value !== 'object' || value === null) return value;
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
    if (ancestors.includes(value)) return '[Circular]';
    ancestors.push(value);
    return value;
  };
}

export function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, isFlat(value) ? undefined : replacer) ?? 'null';
  } catch {
    try {
      return JSON.stringify(value, circularReplacer()) ?? 'null';
    } catch {
      return '"[Unserializable]"';
    }
  }
}

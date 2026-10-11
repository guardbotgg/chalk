import type { ApiMethod, ChalkLevel, ChalkOptions, ColorInput, ColorName, CronState, Fields, LogType, WSAction } from '../types';
import { LevelNode, toLevel, toSeverity, TypeSeverity } from './Levels';
import { inspect, stripVTControlCharacters } from 'node:util';
import { isPlainObject } from '../utils/serialize';
import { ChalkError } from './ChalkError';
import { paint } from '../utils/colors';
import { Entry, Scope } from './Entry';
import { Core } from './Core';

let derivation: { core: Core; scope: Scope; parentLevel: LevelNode } | undefined;


export class Chalk {
  readonly #core: Core;
  readonly #scope: Scope;
  readonly #level: LevelNode;
  #helpers?: Map<string, Chalk>;

  constructor(options: ChalkOptions = {}) {
    const derived = derivation;
    derivation = undefined;
    if (derived) {
      this.#core = derived.core;
      this.#scope = derived.scope;
      this.#level = new LevelNode(derived.parentLevel, derived.core.floor);
      return;
    }

    if (typeof options !== 'object' || options === null) throw new ChalkError('InvalidOption', 'options', 'an object', options);
    if (options.labels !== undefined && !isPlainObject(options.labels)) throw new ChalkError('InvalidOption', 'labels', 'an object of labels', options.labels);
    if (options.fields !== undefined && !isPlainObject(options.fields)) throw new ChalkError('InvalidOption', 'fields', 'an object', options.fields);

    const severity = toSeverity(options.level ?? 'info', 'level');
    this.#scope = Scope.create(options.labels, options.fields);
    this.#core = new Core(options);
    this.#level = new LevelNode(undefined, this.#core.floor, severity);
  }


  /** The lowest level this logger logs. */
  get level(): ChalkLevel {
    return toLevel(this.#level.severity);
  }

  set level(level: ChalkLevel) {
    this.#level.set(toSeverity(level, 'level'));
  }

  /** Checks if a level would be logged. */
  isLevelEnabled(level: ChalkLevel | LogType): boolean {
    const severity = Object.hasOwn(TypeSeverity, level) ? TypeSeverity[level as LogType] : toSeverity(level, 'level');
    return severity !== Infinity && severity >= this.#level.gate;
  }


  trace(...args: unknown[]): void {
    if (this.#level.gate <= 10) this.#log('trace', 10, args);
  }

  debug(...args: unknown[]): void {
    if (this.#level.gate <= 20) this.#log('debug', 20, args);
  }

  info(...args: unknown[]): void {
    if (this.#level.gate <= 30) this.#log('info', 30, args);
  }

  success(...args: unknown[]): void {
    if (this.#level.gate <= 30) this.#log('success', 30, args);
  }

  log(...args: unknown[]): void {
    if (this.#level.gate <= 30) this.#log('log', 30, args);
  }

  warn(...args: unknown[]): void {
    if (this.#level.gate <= 40) this.#log('warn', 40, args);
  }

  error(...args: unknown[]): void {
    if (this.#level.gate <= 50) this.#log('error', 50, args);
  }

  fatal(...args: unknown[]): void {
    if (this.#level.gate <= 60) this.#log('fatal', 60, args);
  }


  /**
   * Returns a logger that adds labels to every line.
   * ```ts
   * const redis = logger.scope('redis', 'violet');
   * const shard = logger.scope({ cluster_1: 'purple', shard_4: true, client: false }); // `false` removes a label
   * ```
   */
  scope(name: string, color?: ColorInput | true): this;
  scope(labels: Record<string, ColorInput | boolean>): this;
  scope(labels: string | Record<string, ColorInput | boolean>, color?: ColorInput | true): this {
    if (typeof labels === 'string') {
      if (!labels) throw new ChalkError('InvalidOption', 'scope', 'a label name or an object of labels', labels);
      return this.#derive(this.#scope.withLabels({ [labels]: color ?? true }, 'scope'));
    }
    if (!isPlainObject(labels)) throw new ChalkError('InvalidOption', 'scope', 'a label name or an object of labels', labels);
    if (isPlainObject(labels.scopedLabels)) throw new ChalkError('LegacyScope');
    return this.#derive(this.#scope.withLabels(labels, 'scope'));
  }

  /**
   * Returns a logger that adds fields to every record.
   * ```ts
   * const log = logger.child({ guildId: guild.id, shard: guild.shardId });
   * ```
   */
  child(fields: Fields): this {
    if (!isPlainObject(fields)) throw new ChalkError('InvalidOption', 'fields', 'an object', fields);
    return this.#derive(this.#scope.withFields(fields));
  }


  /** Logs an HTTP request. */
  api(method: ApiMethod | (string & {}), url: string, status: number, durationMs: number): void {
    const type = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const severity = TypeSeverity[type];
    if (severity < this.#level.gate) return;
    const methodColor: ColorName = method === 'GET' ? 'green' : method === 'POST' ? 'sky' : method === 'DELETE' ? 'red' : 'yellow';
    const statusColor: ColorName = status >= 500 ? 'red' : status >= 400 ? 'orange' : status >= 300 ? 'cyan' : 'green';
    const duration = `${Number(durationMs).toFixed(1)}ms`;
    const text = `${this.bcolor(methodColor, `[${method}]`)} ${url} → ${this.bcolor(statusColor, String(status))} ${paint(`(${duration})`, this.#core.dim)}`;
    const summary = `${method} ${url} ${status} ${duration}`;
    this.#helper('api').#log(type, severity, [text], { method, url, status, duration: durationMs }, summary);
  }

  /** Logs a WebSocket event. */
  ws(eventId: string, socketId: string, action: WSAction, description = ''): void {
    const type = action === 'DISCONNECTED' ? 'warn' : action === 'CONNECTED' ? 'info' : 'debug';
    const severity = TypeSeverity[type];
    if (severity < this.#level.gate) return;
    const actionColor: ColorName = action === 'DISCONNECTED' ? 'orange' : action === 'CONNECTED' ? 'green' : 'purple';
    const text = `${this.bcolor(actionColor, `[${action}]`)} Socket: ${this.bcolor('cyan', socketId)} | Event: ${eventId}${description ? ` - ${description}` : ''}`;
    const summary = `Socket ${socketId} ${action} (${eventId})${description ? `: ${description}` : ''}`;
    this.#helper('ws').#log(type, severity, [text], { action, socketId, eventId, ...(description && { description }) }, summary);
  }

  /** Logs a scheduled job. */
  cron(job: string, state: CronState, message = ''): void {
    const type = state === 'FAILED' ? 'error' : state === 'SUCCESS' ? 'success' : 'info';
    const severity = TypeSeverity[type];
    if (severity < this.#level.gate) return;
    const stateColor: ColorName = state === 'SUCCESS' ? 'green' : state === 'FAILED' ? 'red' : 'yellow';
    const text = `Job: ${this.bcolor('purple', job)} → ${this.bcolor(stateColor, `[${state}]`)}${message ? ` ${message}` : ''}`;
    const summary = `Job ${job} ${state}${message ? `: ${message}` : ''}`;
    this.#helper('cron').#log(type, severity, [text], { job, state, ...(message && { description: message }) }, summary);
  }


  /** Resolves once everything logged so far has been delivered. */
  flush(): Promise<void> {
    return this.#core.flush();
  }

  /** Flushes, then closes log files and stops timers. */
  close(): Promise<void> {
    return this.#core.close();
  }


  /** Colors text if the console is colored. Takes a color name, a hex code, `rgb(r, g, b)` or `[r, g, b]`. */
  color(color: ColorInput, ...content: unknown[]): string {
    return this.#paint(color, false, content);
  }

  /** Same as `color()`, but bold. */
  bcolor(color: ColorInput, ...content: unknown[]): string {
    return this.#paint(color, true, content);
  }

  hex(hex: `#${string}`, ...content: unknown[]): string {
    return this.#paint(hex, false, content);
  }

  bhex(hex: `#${string}`, ...content: unknown[]): string {
    return this.#paint(hex, true, content);
  }

  rgb(rgb: readonly [number, number, number], ...content: unknown[]): string {
    return this.#paint(rgb, false, content);
  }

  brgb(rgb: readonly [number, number, number], ...content: unknown[]): string {
    return this.#paint(rgb, true, content);
  }

  /** Removes colors and other ANSI escape codes. */
  strip(...content: unknown[]): string {
    return stripVTControlCharacters(join(content));
  }

  red(...content: unknown[]): string { return this.#paint('red', false, content); }
  orange(...content: unknown[]): string { return this.#paint('orange', false, content); }
  yellow(...content: unknown[]): string { return this.#paint('yellow', false, content); }
  green(...content: unknown[]): string { return this.#paint('green', false, content); }
  cyan(...content: unknown[]): string { return this.#paint('cyan', false, content); }
  blue(...content: unknown[]): string { return this.#paint('blue', false, content); }
  purple(...content: unknown[]): string { return this.#paint('purple', false, content); }
  violet(...content: unknown[]): string { return this.#paint('violet', false, content); }
  sky(...content: unknown[]): string { return this.#paint('sky', false, content); }
  pink(...content: unknown[]): string { return this.#paint('pink', false, content); }
  peach(...content: unknown[]): string { return this.#paint('peach', false, content); }
  grey(...content: unknown[]): string { return this.#paint('grey', false, content); }

  bRed(...content: unknown[]): string { return this.#paint('red', true, content); }
  bOrange(...content: unknown[]): string { return this.#paint('orange', true, content); }
  bYellow(...content: unknown[]): string { return this.#paint('yellow', true, content); }
  bGreen(...content: unknown[]): string { return this.#paint('green', true, content); }
  bCyan(...content: unknown[]): string { return this.#paint('cyan', true, content); }
  bBlue(...content: unknown[]): string { return this.#paint('blue', true, content); }
  bPurple(...content: unknown[]): string { return this.#paint('purple', true, content); }
  bViolet(...content: unknown[]): string { return this.#paint('violet', true, content); }
  bSky(...content: unknown[]): string { return this.#paint('sky', true, content); }
  bPink(...content: unknown[]): string { return this.#paint('pink', true, content); }
  bPeach(...content: unknown[]): string { return this.#paint('peach', true, content); }
  bGrey(...content: unknown[]): string { return this.#paint('grey', true, content); }


  #log(type: LogType, severity: number, args: unknown[], extra?: Fields, summary?: string): void {
    const entry = new Entry(type, severity, Date.now(), args, this.#scope, extra, summary);
    const { sinks } = this.#core;
    for (let i = 0; i < sinks.length; i++) {
      const sink = sinks[i];
      if (severity < sink.min) continue;
      try {
        sink.transport.write(entry);
      } catch (error) {
        this.#core.transportFailed(sink.transport, error);
      }
    }
    if (severity >= 60) this.#core.flushSync();
  }

  #paint(color: ColorInput, bold: boolean, content: unknown[]): string {
    const text = join(content);
    return this.#core.colors === 0 ? text : paint(text, this.#core.style(color, bold));
  }

  #derive(scope: Scope): this {
    derivation = { core: this.#core, scope, parentLevel: this.#level };
    try {
      return Object.assign(Reflect.construct(Chalk, [], this.constructor) as this, this);
    } finally {
      derivation = undefined;
    }
  }

  #helper(label: string): Chalk {
    const helpers = this.#helpers ??= new Map();
    let helper = helpers.get(label);
    if (!helper) helpers.set(label, helper = this.#derive(this.#scope.withLabels({ [label]: true })));
    return helper;
  }
}


function join(content: unknown[]): string {
  if (content.length === 1 && typeof content[0] === 'string') return content[0];
  return content.map(value => (typeof value === 'string' ? value : inspect(value))).join(' ');
}

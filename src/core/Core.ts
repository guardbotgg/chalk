import { createStyle, NO_STYLE, parseColor, type ColorLevel, type Style } from '../utils/colors';
import type { ChalkOptions, ColorInput, Transport } from '../types';
import { ConsoleTransport } from '../transports/ConsoleTransport';
import { WebhookTransport } from '../transports/WebhookTransport';
import { FileTransport } from '../transports/FileTransport';
import { describeError } from '../utils/serialize';
import { ChalkError } from './ChalkError';
import { toSeverity } from './Levels';


export interface Sink {
  readonly transport: Transport;
  readonly min: number;
}


export class Core {
  readonly sinks: readonly Sink[];
  readonly floor: number;
  readonly colors: ColorLevel;
  readonly dim: Style;
  readonly #styles = new Map<string, Style>();
  readonly #failed = new WeakSet<Transport>();

  constructor(options: ChalkOptions) {
    const sinks: Sink[] = [];
    const add = (transport: Transport, levelName: string) => {
      sinks.push({ transport, min: transport.level === undefined ? 0 : toSeverity(transport.level, levelName) });
    };

    let colors: ColorLevel;
    try {
      colors = this.#addTransports(options, add);
    } catch (error) {
      const custom = Array.isArray(options.transports) ? options.transports : [];
      for (const { transport } of sinks) {
        if (!custom.includes(transport)) transport.close?.().catch(() => {});
      }
      throw error;
    }

    this.sinks = sinks;
    this.floor = Math.min(...sinks.map(sink => sink.min));
    this.colors = colors;
    this.dim = createStyle(undefined, colors, { dim: true });
  }

  #addTransports(options: ChalkOptions, add: (transport: Transport, levelName: string) => void): ColorLevel {
    let colors: ColorLevel = 0;
    if (options.console !== false) {
      if (options.console !== undefined && options.console !== true && typeof options.console !== 'object') {
        throw new ChalkError('InvalidOption', 'console', 'a boolean or console options', options.console);
      }
      const consoleOptions = typeof options.console === 'object' ? options.console : {};
      const transport = new ConsoleTransport({ ...consoleOptions, format: options.format, colors: options.colors, timestamps: options.timestamps });
      colors = transport.colors;
      add(transport, 'console.level');
    }

    if (options.file) {
      const file = typeof options.file === 'string' ? { path: options.file } : options.file;
      add(new FileTransport({ timestamps: options.timestamps, ...file }), 'file.level');
    }

    if (options.webhook) {
      const webhook = typeof options.webhook === 'string' || options.webhook instanceof URL ? { url: options.webhook } : options.webhook;
      add(new WebhookTransport(webhook), 'webhook.level');
    }

    if (options.transports !== undefined && !Array.isArray(options.transports)) {
      throw new ChalkError('InvalidOption', 'transports', 'an array of transports', options.transports);
    }
    for (const [index, transport] of (options.transports ?? []).entries()) {
      if (typeof transport?.write !== 'function') throw new ChalkError('InvalidTransport', index);
      add(transport, `transports[${index}].level`);
    }
    return colors;
  }

  style(color: ColorInput, bold: boolean): Style {
    if (this.colors === 0) return NO_STYLE;
    const key = `${bold ? 'b:' : ''}${Array.isArray(color) ? 'rgb:' : ''}${color}`;
    let style = this.#styles.get(key);
    if (!style) {
      style = createStyle(parseColor(color), this.colors, { bold });
      if (this.#styles.size < 512) this.#styles.set(key, style);
    }
    return style;
  }

  transportFailed(transport: Transport, error: unknown) {
    if (this.#failed.has(transport)) return;
    this.#failed.add(transport);
    const name = typeof transport.constructor === 'function' && transport.constructor !== Object ? transport.constructor.name : 'A transport';
    process.emitWarning(`${name} threw while writing a record: ${describeError(error)}`, { type: 'ChalkWarning', code: 'CHALK_TRANSPORT_FAILED' });
  }

  flushSync() {
    for (const { transport } of this.sinks) {
      try {
        transport.flushSync?.();
      } catch (error) {
        this.transportFailed(transport, error);
      }
    }
  }

  flush(): Promise<void> {
    return this.#settle(transport => transport.flush?.());
  }

  close(): Promise<void> {
    return this.#settle(transport => transport.close?.());
  }

  async #settle(action: (transport: Transport) => Promise<void> | undefined) {
    const results = await Promise.allSettled(this.sinks.map(({ transport }) => Promise.resolve().then(() => action(transport))));
    results.forEach((result, i) => {
      if (result.status === 'rejected') this.transportFailed(this.sinks[i].transport, result.reason);
    });
  }
}

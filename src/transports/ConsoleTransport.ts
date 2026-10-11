import type { ChalkLevel, LogFormat, LogRecord, OutputStream, TimestampOption, Transport } from '../types';
import { resolveColorLevel, type ColorLevel } from '../utils/colors';
import { createTimestampFormatter } from '../utils/timestamps';
import { PrettyFormatter } from '../formatters/PrettyFormatter';
import { JsonFormatter } from '../formatters/JsonFormatter';
import { toSeverity, validateFormat } from '../core/Levels';
import { Warnings, WriteBuffer } from '../utils/output';
import { describeError } from '../utils/serialize';
import { ChalkError } from '../core/ChalkError';
import type { Entry } from '../core/Entry';


export interface ConsoleTransportOptions {
  /** Where to write. Defaults to `process.stdout`. */
  stream?: OutputStream;
  /** Lowest level written. */
  level?: ChalkLevel;
  /** `pretty` (default) or `json`. */
  format?: LogFormat;
  /** Colors in pretty output. Defaults to whatever the stream supports. */
  colors?: boolean;
  /** Timestamp format for pretty output. Defaults to `datetime`. */
  timestamps?: TimestampOption;
}

type Writable = OutputStream & { writableLength?: number; write(chunk: string, callback?: () => void): unknown };


export class ConsoleTransport implements Transport {
  readonly level?: ChalkLevel;
  readonly colors: ColorLevel;
  readonly #stream: Writable;
  readonly #formatter: PrettyFormatter | JsonFormatter;
  #output?: StreamOutput;

  constructor(options: ConsoleTransportOptions = {}) {
    if (options.level !== undefined) toSeverity(options.level, 'console.level');
    const stream = options.stream ?? process.stdout;
    if (typeof stream?.write !== 'function') throw new ChalkError('InvalidOption', 'console.stream', 'a stream with a write() method', stream);
    validateFormat(options.format, 'format');
    if (options.colors !== undefined && typeof options.colors !== 'boolean') {
      throw new ChalkError('InvalidOption', 'colors', 'a boolean', options.colors);
    }

    this.level = options.level;
    this.#stream = stream as Writable;
    const json = options.format === 'json';
    this.colors = json ? 0 : resolveColorLevel(options.colors, stream);
    this.#formatter = json
      ? new JsonFormatter()
      : new PrettyFormatter({ colors: this.colors, timestamp: createTimestampFormatter(options.timestamps) });
    this.#output = StreamOutput.open(this.#stream);
  }

  write(record: LogRecord): void {
    const line = this.#formatter.format(record as Entry);
    if (this.#output) this.#output.push(line);
    else StreamOutput.writeNow(this.#stream, line);
  }

  flushSync(): void {
    this.#output?.flushSync();
  }

  async flush(): Promise<void> {
    this.#output?.flushSync();
    if (this.#stream.writableLength) await new Promise<void>(resolve => this.#stream.write('', resolve));
  }

  async close(): Promise<void> {
    await this.flush();
    this.#output?.release();
    this.#output = undefined;
  }
}


class StreamOutput {
  static #outputs = new WeakMap<OutputStream, StreamOutput>();

  static open(stream: Writable): StreamOutput {
    let output = StreamOutput.#outputs.get(stream);
    if (!output) StreamOutput.#outputs.set(stream, output = new StreamOutput(stream));
    output.#users++;
    return output;
  }

  static writeNow(stream: Writable, line: string) {
    const output = StreamOutput.#outputs.get(stream);
    if (output) {
      output.push(line);
      output.flushSync();
    } else {
      write(stream, line, closedWarnings);
    }
  }

  #users = 0;
  readonly #stream: Writable;
  readonly #buffer?: WriteBuffer;
  readonly #warnings = new Warnings();

  private constructor(stream: Writable) {
    this.#stream = stream;
    if (!stream.isTTY) this.#buffer = new WriteBuffer((data) => write(stream, data, this.#warnings));
  }

  push(line: string) {
    if (this.#buffer) this.#buffer.push(line);
    else write(this.#stream, line, this.#warnings);
  }

  flushSync() {
    this.#buffer?.flushSync();
  }

  release() {
    this.flushSync();
    if (--this.#users > 0) return;
    StreamOutput.#outputs.delete(this.#stream);
  }
}

const closedWarnings = new Warnings();
function write(stream: Writable, data: string, warnings: Warnings) {
  try {
    stream.write(data);
  } catch (error) {
    warnings.warn('CHALK_CONSOLE_WRITE', `Couldn't write logs to the console: ${describeError(error)}`);
  }
}

import { flushOnExit, isExiting, stopFlushingOnExit, Warnings, WriteBuffer } from '../utils/output';
import type { ChalkLevel, LogFormat, LogRecord, TimestampOption, Transport } from '../types';
import { PrettyFormatter } from '../formatters/PrettyFormatter';
import { createTimestampFormatter } from '../utils/timestamps';
import { toSeverity, validateFormat } from '../core/Levels';
import { JsonFormatter } from '../formatters/JsonFormatter';
import { describeError } from '../utils/serialize';
import { ChalkError } from '../core/ChalkError';
import type { Entry } from '../core/Entry';
import path from 'node:path';
import fs from 'node:fs';


export interface FileTransportOptions {
  /** Path to the log file. The folder is created if it doesn't exist. */
  path: string;
  /** Lowest level written. */
  level?: ChalkLevel;
  /** `pretty` (default) writes the console output without colors. `json` writes one JSON object per line. */
  format?: LogFormat;
  /** Timestamp format for pretty output. Files always have timestamps, so `false` means the default `datetime`. */
  timestamps?: TimestampOption;
  /**
   * `true` (default) writes synchronously once per tick, so nothing is lost if the app crashes.
   * `false` writes in the background so it never blocks, but the last few lines can be lost in a crash.
   */
  sync?: boolean;
}

const MAX_PENDING = 16 * 1024 * 1024;


export class FileTransport implements Transport {
  readonly level?: ChalkLevel;
  readonly path: string;
  readonly #formatter: PrettyFormatter | JsonFormatter;
  readonly #sync: boolean;
  #file?: LogFile;

  constructor(options: FileTransportOptions) {
    if (typeof options?.path !== 'string' || !options.path) throw new ChalkError('InvalidOption', 'file.path', 'a file path', options?.path);
    if (options.level !== undefined) toSeverity(options.level, 'file.level');
    validateFormat(options.format, 'file.format');
    if (options.sync !== undefined && typeof options.sync !== 'boolean') throw new ChalkError('InvalidOption', 'file.sync', 'a boolean', options.sync);

    this.level = options.level;
    this.path = path.resolve(options.path);
    this.#formatter = options.format === 'json'
      ? new JsonFormatter()
      : new PrettyFormatter({ colors: 0, timestamp: createTimestampFormatter(options.timestamps === false ? true : options.timestamps) });
    this.#sync = options.sync ?? true;
    this.#file = LogFile.open(this.path, this.#sync);
  }

  write(record: LogRecord): void {
    const line = this.#formatter.format(record as Entry);
    if (this.#file) this.#file.push(line);
    else LogFile.writeNow(this.path, line);
  }

  flushSync(): void {
    this.#file?.flushSync();
  }

  async flush(): Promise<void> {
    await this.#file?.flush();
  }

  async close(): Promise<void> {
    const file = this.#file;
    this.#file = undefined;
    await file?.release(this.#sync);
  }
}


class LogFile {
  static #open = new Map<string, LogFile>();

  static open(filepath: string, sync: boolean): LogFile {
    let file = LogFile.#open.get(filepath);
    if (!file) LogFile.#open.set(filepath, file = new LogFile(filepath));
    file.#users++;
    if (sync) file.#syncUsers++;
    return file;
  }

  static writeNow(filepath: string, line: string) {
    const file = LogFile.#open.get(filepath);
    if (file) {
      file.push(line);
      file.flushSync();
      return;
    }
    try {
      fs.appendFileSync(filepath, line);
    } catch (error) {
      closedWarnings.warn('CHALK_FILE_WRITE', `Couldn't write logs to "${filepath}": ${describeError(error)}`);
    }
  }

  #fd: number;
  #users = 0;
  #syncUsers = 0;
  #pending = '';
  #writing = false;
  #flushingSync = false;
  #queued = 0;
  #written = 0;
  #waiters: { target: number; resolve: () => void }[] = [];
  readonly #buffer = new WriteBuffer((data) => this.#enqueue(data));
  readonly #warnings = new Warnings();

  private constructor(readonly filepath: string) {
    fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    this.#fd = fs.openSync(this.filepath, 'a');
  }

  push(line: string) {
    this.#buffer.push(line);
  }

  flushSync() {
    this.#flushingSync = true;
    try {
      this.#buffer.flushSync();
      if (this.#pending) this.#enqueue('');
    } finally {
      this.#flushingSync = false;
    }
  }

  async flush() {
    this.#buffer.flushSync();
    const target = this.#queued;
    if (this.#written < target) await new Promise<void>(resolve => this.#waiters.push({ target, resolve }));
  }

  release(sync: boolean): Promise<void> | void {
    if (sync) this.#syncUsers--;
    if (--this.#users > 0) return this.flush();
    LogFile.#open.delete(this.filepath);
    this.#buffer.flushSync();
    if (this.#written >= this.#queued) return this.#close();
    return this.flush().then(() => this.#close());
  }

  #close() {
    try {
      fs.closeSync(this.#fd);
    } catch {
      return;
    }
  }

  #enqueue(data: string) {
    if (this.#syncUsers > 0 || this.#flushingSync || isExiting()) {
      const all = this.#pending + data;
      this.#written += this.#pending.length;
      this.#pending = '';
      stopFlushingOnExit(this);
      if (all) this.#writeSync(all);
      return;
    }
    if (this.#pending.length >= MAX_PENDING) {
      this.#warnings.warn('CHALK_FILE_DROPPED', `Logs are logged faster than they can be written to "${this.filepath}", so some were dropped.`);
      return;
    }
    this.#pending += data;
    this.#queued += data.length;
    flushOnExit(this);
    this.#writeNext();
  }

  #writeNext() {
    if (this.#writing) return;
    if (!this.#pending) {
      stopFlushingOnExit(this);
      return;
    }
    const length = this.#pending.length;
    const bytes = Buffer.from(this.#pending);
    this.#pending = '';
    this.#writing = true;
    this.#writeAsync(bytes, 0, length);
  }

  #writeAsync(bytes: Buffer, offset: number, length: number) {
    fs.write(this.#fd, bytes, offset, bytes.length - offset, null, (error, written) => {
      if (!error && offset + written < bytes.length) return this.#writeAsync(bytes, offset + written, length);
      if (error) {
        this.#warnings.warn('CHALK_FILE_WRITE', `Couldn't write logs to "${this.filepath}": ${describeError(error)}`);
      } else {
        this.#warnings.reset('CHALK_FILE_WRITE');
        this.#warnings.reset('CHALK_FILE_DROPPED');
      }
      this.#writing = false;
      this.#written += length;
      const done = this.#waiters.filter(({ target }) => target <= this.#written);
      this.#waiters = this.#waiters.filter(({ target }) => target > this.#written);
      for (const { resolve } of done) resolve();
      this.#writeNext();
    });
  }

  #writeSync(data: string) {
    try {
      const bytes = Buffer.from(data);
      for (let offset = 0; offset < bytes.length;) offset += fs.writeSync(this.#fd, bytes, offset);
      this.#warnings.reset('CHALK_FILE_WRITE');
    } catch (error) {
      this.#warnings.warn('CHALK_FILE_WRITE', `Couldn't write logs to "${this.filepath}": ${describeError(error)}`);
    }
  }
}

const closedWarnings = new Warnings();

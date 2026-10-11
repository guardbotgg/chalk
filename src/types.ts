export type ColorName =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan'
  | 'blue' | 'purple' | 'violet' | 'sky' | 'pink' | 'peach' | 'grey';

/** A palette color name, a hex code (`#4ADE80` or `#4AE`), `rgb(r, g, b)`, or an `[r, g, b]` array. */
export type ColorInput =
  | ColorName
  | `#${string}`
  | `rgb(${string})`
  | readonly [number, number, number];

/** A logger logs its own level and everything above it. `silent` turns logging off. */
export type ChalkLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/** The method a record was logged with. `success` and `log` count as `info`. */
export type LogType = 'trace' | 'debug' | 'info' | 'success' | 'log' | 'warn' | 'error' | 'fatal';

/** `pretty` for people, `json` for log collectors (one JSON object per line). */
export type LogFormat = 'pretty' | 'json';

/**
 * - `datetime`: `2026-09-26 19:02:33.412` in local time (default)
 * - `time`: `19:02:33.412` in local time
 * - `iso`: `2026-09-26T13:32:33.412Z` in UTC
 */
export type TimestampStyle = 'datetime' | 'time' | 'iso';

/** A timestamp style, your own format function, or `false` to turn timestamps off. */
export type TimestampOption = boolean | TimestampStyle | ((date: Date) => string);

/** Labels shown on every line, mapped to their colors. Use `true` for the default color. */
export type Labels = Record<string, ColorInput | true>;

/** Extra data added to records, as key/value pairs. */
export type Fields = Record<string, unknown>;

/** Anything with a `write()` method, like `process.stdout`. */
export interface OutputStream {
  write(chunk: string): unknown;
  /** Whether it's a terminal. Terminals get colors and are written to right away. */
  isTTY?: boolean;
}


export interface ChalkOptions {
  /** Lowest level to log. Defaults to `info`. */
  level?: ChalkLevel;
  /** Console output format: `pretty` (default) or `json`. */
  format?: LogFormat;
  /**
   * Turns colors on or off in pretty console output. By default they're on when the terminal supports them, and
   * `NO_COLOR` and `FORCE_COLOR` are respected.
   */
  colors?: boolean;
  /** Timestamp format for pretty output: `datetime` (default), `time`, `iso`, a function, or `false`. */
  timestamps?: TimestampOption;
  /** Labels shown on every line, like `{ client: 'orange' }`. */
  labels?: Labels;
  /** Fields added to every record. */
  fields?: Fields;
  /** Console options, or `false` to turn the console off. */
  console?: boolean | ConsoleOptions;
  /** Also write to a log file. Takes a path or options. Ignored if empty or `false`. */
  file?: string | FileOptions | false;
  /** Also send logs to a Discord webhook. Takes a URL or options. Ignored if empty or `false`. */
  webhook?: string | URL | WebhookOptions | false;
  /** Your own outputs. They get every record the logger logs. */
  transports?: Transport[];
}

export interface ConsoleOptions {
  /** Where to write. Defaults to `process.stdout`. */
  stream?: OutputStream;
  /** Lowest level written to the console. */
  level?: ChalkLevel;
}

export interface FileOptions {
  /** Path to the log file. The folder is created if it doesn't exist. */
  path: string;
  /** Lowest level written to the file. */
  level?: ChalkLevel;
  /** `pretty` (default) writes the console output without colors. `json` writes one JSON object per line. */
  format?: LogFormat;
  /**
   * `true` (default) writes synchronously once per tick, so nothing is lost if the app crashes.
   * `false` writes in the background so it never blocks, but the last few lines can be lost in a crash.
   */
  sync?: boolean;
}

export interface WebhookOptions {
  /** Discord webhook URL. */
  url: string | URL;
  /** Lowest level sent to the webhook. Defaults to `warn`. */
  level?: ChalkLevel;
  /** Overrides the webhook's name. */
  username?: string;
  /** Overrides the webhook's avatar. */
  avatarURL?: string;
  /** Post in this thread (or forum post) instead of the channel. */
  threadId?: string;
  /** How long to batch logs before sending, in ms. Defaults to 2000. */
  interval?: number;
}


/** A single log entry, as transports receive it. */
export interface LogRecord {
  /** The method it was logged with. */
  readonly type: LogType;
  /** The level name. `success` and `log` are `info`. */
  readonly level: Exclude<ChalkLevel, 'silent'>;
  /** The level as a number, from 10 (`trace`) to 60 (`fatal`). */
  readonly severity: number;
  /** When it was logged, as a Unix timestamp in ms. */
  readonly time: number;
  /** The logger's labels, like `['client', 'shard_4']`. */
  readonly labels: readonly string[];
  /** The raw arguments passed to the log method. */
  readonly args: readonly unknown[];
  /** The text of the log without colors. If only an error was logged, this is the error's message. */
  readonly message: string;
  /** The first error that was logged, if any. */
  readonly error: Error | undefined;
  /** The logger's fields merged with any plain objects that were logged. */
  readonly fields: Readonly<Fields>;
}

/**
 * Where logs go, like the console, a file or a webhook. Implement this to send logs somewhere else:
 * ```ts
 * const sentry: Transport = {
 *   level: 'error',
 *   write: (record) => Sentry.captureException(record.error ?? new Error(record.message)),
 * };
 * ```
 */
export interface Transport {
  /** Lowest level this transport receives. */
  readonly level?: ChalkLevel;
  /** Called for each record, inside the log call. Keep it fast and do slow work asynchronously. */
  write(record: LogRecord): void;
  /** Resolves once everything logged so far has been delivered. */
  flush?(): Promise<void>;
  /** Flushes and frees resources like files and timers. Records sent after this should still work. */
  close?(): Promise<void>;
  /**
   * Writes anything buffered immediately. The logger calls this after `fatal()` because a crash usually follows.
   * If your transport buffers, also flush it on the process `exit` event.
   */
  flushSync?(): void;
}


export type ApiMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type WSAction =
  | 'CONNECTED' | 'DISCONNECTED' | 'EVENT_IN' | 'EVENT_OUT';

export type CronState =
  | 'STARTING' | 'SUCCESS' | 'FAILED';

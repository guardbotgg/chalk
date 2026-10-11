import type { ChalkLevel, LogRecord, LogType, Transport, WebhookOptions } from '../types';
import { flushBeforeExit, isExiting, stopFlushingOnExit, Warnings } from '../utils/output';
import { ColorPalette, LabelColors, toInteger } from '../utils/colors';
import { PrettyFormatter } from '../formatters/PrettyFormatter';
import { ChalkError } from '../core/ChalkError';
import { safeText } from '../utils/serialize';
import { toSeverity } from '../core/Levels';
import type { Entry } from '../core/Entry';


export type WebhookTransportOptions = WebhookOptions;

interface Embed {
  title: string;
  description: string;
  color: number;
  timestamp: string;
  footer?: { text: string };
}

interface Queued {
  embed: Embed;
  key: string;
  count: number;
  seq: number;
}

interface Batch {
  items: Queued[];
  dropped: number;
}

type Outcome = 'sent' | 'rejected' | 'retry' | 'unreachable';

const MAX_EMBEDS = 10;
const MAX_MESSAGE_SIZE = 6000;
const MAX_TITLE = 256;
const MAX_DESCRIPTION = 4096;

const MAX_QUEUE = 100;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT = 5_000;
const FLUSH_TIMEOUT = 5_000;
const OFFLINE_PAUSE = 30_000;
const MAX_RETRY_DELAY = 60_000;
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

const EMOJIS: Record<LogType, string> = {
  trace: '🔍', debug: '🐛', info: 'ℹ️', success: '✅', log: '💬', warn: '⚠️', error: '❌', fatal: '💀',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;


export class WebhookTransport implements Transport {
  readonly level: ChalkLevel;
  readonly #url: string;
  readonly #safeUrl: string;
  readonly #username?: string;
  readonly #avatarURL?: string;
  readonly #interval: number;
  readonly #formatter = new PrettyFormatter({ colors: 0 });
  readonly #warnings = new Warnings();

  #queue: Queued[] = [];
  #queued = 0;
  #handled = 0;
  #dropped = 0;
  #attempts = 0;
  #lastError = '';
  #resumeAt = 0;
  #deadline = Infinity;
  #flushes = 0;
  #timer?: NodeJS.Timeout;
  #timerDue = 0;
  #sending?: Promise<void>;
  #disabled = false;

  constructor(options: WebhookTransportOptions) {
    const url = parseWebhookURL(options?.url, options?.threadId);
    if (options.level !== undefined) toSeverity(options.level, 'webhook.level');
    const interval = options.interval ?? 2000;
    if (typeof interval !== 'number' || !Number.isFinite(interval) || interval < 0) {
      throw new ChalkError('InvalidOption', 'webhook.interval', 'a number of milliseconds', interval);
    }

    this.level = options.level ?? 'warn';
    this.#url = url.href;
    this.#safeUrl = redact(url.href);
    this.#username = options.username;
    this.#avatarURL = options.avatarURL;
    this.#interval = interval;
  }

  write(record: LogRecord): void {
    if (this.#disabled || isExiting()) return;
    const embed = this.#embed(record as Entry);
    const key = `${embed.title}\n${embed.description}`;

    const last = this.#queue.at(-1);
    if (last?.key === key) {
      last.count++;
      return;
    }
    if (this.#queue.length >= MAX_QUEUE) {
      this.#dropped++;
      return;
    }
    this.#queue.push({ embed, key, count: 1, seq: ++this.#queued });
    flushBeforeExit(this);
    this.#schedule();
  }

  async flush(): Promise<void> {
    const target = this.#queued;
    const deadline = Date.now() + FLUSH_TIMEOUT;
    this.#deadline = Math.min(this.#deadline, deadline);
    this.#flushes++;
    try {
      while (this.#handled < target && !this.#disabled) {
        if (this.#sending) {
          await this.#sending;
          continue;
        }
        const wait = Math.max(this.#resumeAt - Date.now(), 0);
        if (Date.now() + wait >= deadline) break;
        if (wait > 0) {
          await sleep(wait);
          continue;
        }
        await this.#send();
      }
    } finally {
      if (--this.#flushes === 0) this.#deadline = Infinity;
    }
    if (this.#handled < target) this.#giveUp(target);
  }

  async close(): Promise<void> {
    await this.flush();
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#queue.length === 0) stopFlushingOnExit(this);
  }

  #schedule() {
    if (this.#sending || this.#disabled || this.#queue.length === 0) return;
    const delay = Math.max(this.#queue.length >= MAX_EMBEDS ? 0 : this.#interval, this.#resumeAt - Date.now());
    const due = Date.now() + delay;
    if (this.#timer && this.#timerDue <= due) return;

    clearTimeout(this.#timer);
    this.#timerDue = due;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      if (Date.now() < this.#resumeAt) this.#schedule();
      else void this.#send();
    }, delay);
    this.#timer.unref();
  }

  #send(): Promise<void> {
    return this.#sending ??= this.#sendBatch().finally(() => {
      this.#sending = undefined;
      if (this.#queue.length === 0) stopFlushingOnExit(this);
      else this.#schedule();
    });
  }

  async #sendBatch(): Promise<void> {
    const batch = this.#takeBatch();
    if (batch.items.length === 0) return;
    const outcome = await this.#post(batch);

    if (outcome === 'retry' || outcome === 'unreachable') {
      if (++this.#attempts < MAX_ATTEMPTS) {
        this.#queue.unshift(...batch.items);
        this.#dropped += batch.dropped;
        if (outcome === 'unreachable' || this.#resumeAt <= Date.now()) this.#resumeAt = Date.now() + 1000 * 2 ** (this.#attempts - 1);
        return;
      }
      const count = batch.items.reduce((sum, item) => sum + item.count, 0);
      this.#warnings.warn(
        outcome === 'unreachable' ? 'CHALK_WEBHOOK_UNREACHABLE' : 'CHALK_WEBHOOK_REJECTED',
        `Couldn't send ${plural(count, 'log')} to the Discord webhook ${this.#safeUrl}: ${this.#lastError}`,
      );
      if (outcome === 'unreachable') this.#resumeAt = Date.now() + OFFLINE_PAUSE;
    }
    this.#attempts = 0;
    this.#handled = Math.max(this.#handled, batch.items.at(-1)!.seq);
  }

  #takeBatch(): Batch {
    const items: Queued[] = [];
    let size = 0;
    while (this.#queue.length > 0 && items.length < MAX_EMBEDS) {
      const { embed, count } = this.#queue[0];
      const itemSize = embed.title.length + embed.description.length + (count > 1 ? repeated(count).length : 0);
      if (items.length > 0 && size + itemSize > MAX_MESSAGE_SIZE) break;
      items.push(this.#queue.shift()!);
      size += itemSize;
    }
    const dropped = this.#dropped;
    this.#dropped = 0;
    return { items, dropped };
  }

  async #post(batch: Batch): Promise<Outcome> {
    const body = JSON.stringify({
      content: batch.dropped > 0 ? `⚠️ ${plural(batch.dropped, 'more log')} ${batch.dropped === 1 ? 'was' : 'were'} dropped, as they came in faster than Discord accepts them.` : undefined,
      username: this.#username,
      avatar_url: this.#avatarURL,
      embeds: batch.items.map(({ embed, count }) => (count > 1 ? { ...embed, footer: { text: repeated(count) } } : embed)),
      allowed_mentions: { parse: [] },
    });

    let response: Response;
    try {
      response = await fetch(this.#url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(Math.max(1, Math.min(REQUEST_TIMEOUT, this.#deadline - Date.now()))),
      });
    } catch (error) {
      this.#lastError = describeFetchError(error);
      return 'unreachable';
    }

    const text = await response.text().catch(() => '');
    if (response.headers.get('x-ratelimit-remaining') === '0') this.#resumeAt = Date.now() + retryDelay(response.headers.get('x-ratelimit-reset-after'));

    if (response.ok) {
      for (const code of ['CHALK_WEBHOOK_UNREACHABLE', 'CHALK_WEBHOOK_REJECTED', 'CHALK_WEBHOOK_TIMEOUT']) this.#warnings.reset(code);
      return 'sent';
    }
    this.#lastError = `HTTP ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`;
    if (response.status === 429) {
      this.#resumeAt = Date.now() + retryDelay(parseRetryAfter(text) ?? response.headers.get('retry-after'));
      return 'retry';
    }
    if (response.status >= 500) return 'retry';
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      this.#disable();
      this.#warnings.warn('CHALK_WEBHOOK_INVALID', `The Discord webhook ${this.#safeUrl} was deleted or can't be used (HTTP ${response.status}), so logs won't be sent to it anymore.`);
      return 'rejected';
    }
    this.#warnings.warn('CHALK_WEBHOOK_REJECTED', `Discord rejected logs sent to the webhook ${this.#safeUrl} (${this.#lastError})`);
    return 'rejected';
  }

  #giveUp(target: number) {
    let count = 0;
    this.#queue = this.#queue.filter((item) => {
      if (item.seq > target) return true;
      count += item.count;
      return false;
    });
    this.#handled = Math.max(this.#handled, target);
    this.#attempts = 0;
    if (count > 0) this.#warnings.warn('CHALK_WEBHOOK_TIMEOUT', `${plural(count, 'log')} couldn't be sent to the Discord webhook ${this.#safeUrl} in time, and were dropped (${this.#lastError || 'rate limited'}).`);
    if (this.#queue.length === 0 && !this.#sending) stopFlushingOnExit(this);
  }

  #disable() {
    this.#disabled = true;
    this.#queue = [];
    this.#handled = this.#queued;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    stopFlushingOnExit(this);
  }

  #embed(entry: Entry): Embed {
    const { type } = entry;
    const labels = entry.labels.map(label => `[${label.toUpperCase()}]`);
    if (type !== 'log') labels.push(`[${type.toUpperCase()}]`);
    return {
      title: truncate(`${EMOJIS[type]} ${labels.join(' ') || 'Log'}`, MAX_TITLE),
      description: codeBlock(this.#formatter.body(entry)),
      color: toInteger(ColorPalette[LabelColors[type] ?? 'grey']),
      timestamp: new Date(entry.time).toISOString(),
    };
  }
}


function parseWebhookURL(value: unknown, threadId: unknown): URL {
  if (typeof value !== 'string' && !(value instanceof URL)) throw new ChalkError('InvalidWebhookURL', describeType(value));
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new ChalkError('InvalidWebhookURL', `"${redact(String(value))}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ChalkError('InvalidWebhookURL', `"${redact(url.href)}"`);
  if (threadId !== undefined) {
    if (typeof threadId !== 'string' || !threadId) throw new ChalkError('InvalidOption', 'webhook.threadId', 'a thread ID', threadId);
    url.searchParams.set('thread_id', threadId);
  }
  return url;
}

function redact(url: string): string {
  return url.replace(/(\/webhooks\/[^/]+\/)[^/?#]+/, '$1***');
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  const type = Array.isArray(value) ? 'array' : typeof value;
  return `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`;
}

function codeBlock(text: string): string {
  const safe = (text || ' ').replace(/`(?=`)/g, `\`${ZERO_WIDTH_SPACE}`);
  const room = MAX_DESCRIPTION - 8;
  return `\`\`\`\n${safe.length > room ? `${cut(safe, room - 15)}\n… (truncated)` : safe}\n\`\`\``;
}

const repeated = (count: number) => `Repeated ${count} times`;

function truncate(text: string, length: number): string {
  return text.length <= length ? text : `${cut(text, length - 1)}…`;
}

function cut(text: string, length: number): string {
  if (text.length <= length) return text;
  const code = text.charCodeAt(length - 1);
  return text.slice(0, code >= 0xD800 && code <= 0xDBFF ? length - 1 : length);
}

function parseRetryAfter(body: string): number | undefined {
  try {
    const { retry_after: retryAfter } = JSON.parse(body) as { retry_after?: unknown };
    return typeof retryAfter === 'number' ? retryAfter : undefined;
  } catch {
    return undefined;
  }
}

function retryDelay(seconds: number | string | null | undefined): number {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? Math.min(value * 1000, MAX_RETRY_DELAY) : 1000;
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return safeText(error);
  if (error.name === 'TimeoutError') return `no answer within ${REQUEST_TIMEOUT / 1000}s`;
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return `${error.message}${cause}`;
}

interface SyncFlushable {
  flushSync(): void;
}

interface AsyncFlushable {
  flush(): Promise<void>;
}

const MAX_BUFFERED = 64 * 1024;
const syncTargets = new Set<SyncFlushable>();
const asyncTargets = new Set<AsyncFlushable>();
let hooked = false;
let exiting = false;


export function isExiting(): boolean {
  return exiting;
}

function hook() {
  if (hooked) return;
  hooked = true;
  process.on('exit', () => {
    exiting = true;
    for (const target of syncTargets) {
      try {
        target.flushSync();
      } catch {
        continue;
      }
    }
  });
  process.on('beforeExit', () => {
    for (const target of asyncTargets) target.flush().catch(() => {});
  });
}

export function flushOnExit(target: SyncFlushable) {
  hook();
  syncTargets.add(target);
}

export function flushBeforeExit(target: AsyncFlushable) {
  hook();
  asyncTargets.add(target);
}

export function stopFlushingOnExit(target: object) {
  syncTargets.delete(target as SyncFlushable);
  asyncTargets.delete(target as AsyncFlushable);
}


export class Warnings {
  #reported = new Set<string>();

  warn(code: string, message: string) {
    if (this.#reported.has(code)) return;
    this.#reported.add(code);
    process.emitWarning(message, { type: 'ChalkWarning', code });
  }

  reset(code: string) {
    this.#reported.delete(code);
  }
}


export class WriteBuffer {
  #data = '';
  #scheduled = false;
  readonly #write: (data: string) => void;

  constructor(write: (data: string) => void) {
    this.#write = write;
  }

  push(line: string) {
    if (!this.#data) flushOnExit(this);
    this.#data += line;
    if (this.#data.length >= MAX_BUFFERED || isExiting()) {
      this.flushSync();
    } else if (!this.#scheduled) {
      this.#scheduled = true;
      queueMicrotask(this.#flush);
    }
  }

  flushSync() {
    if (!this.#data) return;
    const data = this.#data;
    this.#data = '';
    stopFlushingOnExit(this);
    this.#write(data);
  }

  #flush = () => {
    this.#scheduled = false;
    this.flushSync();
  };
}

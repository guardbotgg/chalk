import { inspect } from 'node:util';


const describe = (value: unknown) => inspect(value, { depth: 1, breakLength: Infinity });

const messages = {
  InvalidOption: (name: string, expected: string, actual: unknown) => `Expected "${name}" to be ${expected}, but got ${describe(actual)}.`,
  InvalidLevel: (name: string, actual: unknown) => `Expected "${name}" to be one of "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent", but got ${describe(actual)}.`,
  InvalidColor: (name: string, actual: unknown) => `Expected "${name}" to be a color name, a hex code, "rgb(r, g, b)" or an [r, g, b] tuple, but got ${describe(actual)}.`,
  InvalidTransport: (index: number) => `Expected "transports[${index}]" to be an object with a write(record) method.`,
  InvalidWebhookURL: (received: string) => `Expected "webhook" to be a Discord webhook URL, but got ${received}.`,
  LegacyScope: () => 'scope() takes the labels directly since v3: replace `scope({ scopedLabels: { ... } })` with `scope({ ... })`.',
} satisfies Record<string, (...values: never[]) => string>;

export type ChalkErrorName = keyof typeof messages;
type MessageValues<K extends ChalkErrorName> = Parameters<(typeof messages)[K]>;


/** Thrown when a logger is created with invalid options. */
export class ChalkError<K extends ChalkErrorName = ChalkErrorName> extends TypeError {
  public readonly code: K;
  constructor(code: K, ...values: MessageValues<K>) {
    super((messages[code] as (...values: unknown[]) => string)(...values));
    this.name = `ChalkError [${code}]`;
    this.code = code;
  }
}

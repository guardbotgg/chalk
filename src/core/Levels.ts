import type { ChalkLevel, LogType } from '../types';
import { ChalkError } from './ChalkError';


export const LevelSeverity: Readonly<Record<ChalkLevel, number>> = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
});

export const TypeLevel: Readonly<Record<LogType, Exclude<ChalkLevel, 'silent'>>> = Object.freeze({
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  success: 'info',
  log: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
});

export const TypeSeverity = Object.freeze(
  Object.fromEntries(Object.entries(TypeLevel).map(([type, level]) => [type, LevelSeverity[level]])),
) as Readonly<Record<LogType, number>>;

const levelBySeverity = new Map(Object.entries(LevelSeverity).map(([name, severity]) => [severity, name as ChalkLevel]));

let version = 0;


export class LevelNode {
  #own: number | undefined;
  #version = -1;
  #severity = 0;
  #gate = 0;

  constructor(readonly parent: LevelNode | undefined, readonly floor: number, own?: number) {
    this.#own = own;
  }

  get severity(): number {
    if (this.#version !== version) this.#refresh();
    return this.#severity;
  }

  get gate(): number {
    if (this.#version !== version) this.#refresh();
    return this.#gate;
  }

  set(severity: number) {
    this.#own = severity;
    version++;
  }

  #refresh() {
    this.#severity = this.#own ?? this.parent?.severity ?? LevelSeverity.info;
    this.#gate = Math.max(this.#severity, this.floor);
    this.#version = version;
  }
}


export function toSeverity(level: unknown, name: string): number {
  const severity = typeof level === 'string' && Object.hasOwn(LevelSeverity, level) ? LevelSeverity[level as ChalkLevel] : undefined;
  if (severity === undefined) throw new ChalkError('InvalidLevel', name, level);
  return severity;
}

export function toLevel(severity: number): ChalkLevel {
  return levelBySeverity.get(severity) ?? 'silent';
}

export function validateFormat(format: unknown, name: string) {
  if (format !== undefined && format !== 'pretty' && format !== 'json') throw new ChalkError('InvalidOption', name, '"pretty" or "json"', format);
}

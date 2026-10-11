import { quote, safeText, serializeError, stringify } from '../utils/serialize';
import { createTimestampFormatter } from '../utils/timestamps';
import { stripVTControlCharacters } from 'node:util';
import type { Entry, Scope } from '../core/Entry';
import type { Fields, LogType } from '../types';
import { TypeLevel } from '../core/Levels';



interface ScopeParts {
  labels: string;
  fields: string;
  hasLabels: boolean;
  hasErr: boolean;
}

const HEADS = Object.fromEntries(Object.entries(TypeLevel).map(([type, level]) => [type, `{"level":"${level}","time":"`])) as Record<LogType, string>;


export class JsonFormatter {
  readonly #time = createTimestampFormatter('iso')!;

  format(entry: Entry): string {
    const scope = entry.scope.cached(this, buildScopeParts);
    const head = `${HEADS[entry.type]}${this.#time(entry.time)}"${scope.labels},"msg":`;
    try {
      return this.#body(entry, scope, head);
    } catch {
      return `${head}${quote(plain(entry.args.map(safeText).join(' ')))}}\n`;
    }
  }

  #body(entry: Entry, scope: ScopeParts, head: string): string {
    const { args } = entry;
    if (args.length === 1 && typeof args[0] === 'string' && !entry.extra) return `${head}${quote(plain(args[0]))}${scope.fields}}\n`;

    const { error, objects } = entry.parts;
    const hasError = error !== undefined;
    let line = head + quote(entry.message);
    if (!objects && !entry.extra && !(hasError && scope.hasErr)) line += scope.fields;
    else if (objects?.length === 1 && !entry.extra && !entry.scope.fields) line += fieldsJson(objects[0], scope.hasLabels, hasError);
    else line += fieldsJson(entry.fields, scope.hasLabels, hasError);

    if (error) line += `,"err":${stringify(serializeError(error))}`;
    return `${line}}\n`;
  }
}


function buildScopeParts(scope: Scope): ScopeParts {
  const hasLabels = scope.names.length > 0;
  return {
    labels: hasLabels ? `,"scope":${quote(scope.names.join(':'))}` : '',
    fields: scope.fields ? fieldsJson(scope.fields, hasLabels, false) : '',
    hasLabels,
    hasErr: scope.fields !== undefined && 'err' in scope.fields,
  };
}

const plain = (text: string) => (text.includes('\x1b') ? stripVTControlCharacters(text) : text);

function fieldsJson(fields: Readonly<Fields>, hasLabels: boolean, hasError: boolean): string {
  const isReserved = (key: string) => key === 'level' || key === 'time' || key === 'msg' || (hasLabels && key === 'scope') || (hasError && key === 'err');
  let safe = fields;
  if ('level' in fields || 'time' in fields || 'msg' in fields || (hasLabels && 'scope' in fields) || (hasError && 'err' in fields)) {
    const renamed: Fields = {};
    for (const [key, value] of Object.entries(fields)) renamed[isReserved(key) ? `_${key}` : key] = value;
    safe = renamed;
  }
  const json = stringify(safe);
  if (!json.startsWith('{')) return `,"fields":${json}`;
  return json.length > 2 ? `,${json.slice(1, -1)}` : '';
}

import { appendFile, colorize, formatArg, sendWebhook, stripAnsi } from "./utils";
import { ChalkOptions, ColorInput } from "./types";
import { DefaultLabels } from "./constants";
import path from 'node:path';
import fs from 'node:fs';


export class Chalk {
  private timestamps: boolean;
  private timestampFormat?: (date: Date) => string;
  private useColors: boolean;
  private file?: string;
  private webhook?: string;
  private prefix?: string;

  private labelMap: Record<string, ColorInput>;
  private timers = new Map<string, number>();
  private scopeLabels: string[] = [];

  constructor(options: ChalkOptions = {}, scopeLabels: string[] = []) {
    this.timestamps = options.timestamps ?? true;
    this.timestampFormat = options.timestampFormat;
    this.useColors = options.useColors ?? process.stdout.isTTY;
    this.file = options.file;
    this.webhook = options.webhook;
    this.prefix = options.prefix;
    this.labelMap = { ...DefaultLabels, ...options.labels };
    this.scopeLabels = scopeLabels;

    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    }
  }

  // Logging Methods
  log(labels: string[], ...args: any[]) {
    this.print(labels, args);
  }

  success(labels: string[], ...args: any[]) {
    this.print(['success', ...labels], args);
  }

  info(labels: string[], ...args: any[]) {
    this.print(['info', ...labels], args);
  }

  warn(labels: string[], ...args: any[]) {
    this.print(['warn', ...labels], args);
  }

  error(labels: string[], ...args: any[]) {
    this.print(['error', ...labels], args);
  }

  debug(labels: string[], ...args: any[]) {
    this.print(['debug', ...labels], args);
  }

  // Scope Helpers
  scope(labels: string[]) {
    return new Chalk(
      {
        timestamps: this.timestamps,
        timestampFormat: this.timestampFormat,
        useColors: this.useColors,
        file: this.file,
        webhook: this.webhook,
        prefix: this.prefix,
        labels: this.labelMap,
      },
      [...this.scopeLabels, ...labels]
    );
  }

  shard(id: number) {
    return this.scope(['shard', `#${id}`]);
  }

  cluster(id: number) {
    return this.scope(['cluster', `#${id}`]);
  }

  command(name: string) {
    return this.scope(['command', name]);
  }
  
  // Timers 
  time(id: string) {
    this.timers.set(id, Date.now());
  }

  timeEnd(id: string, labels: string[] = []) {
    const start = this.timers.get(id);
    if (!start) return;
    const diff = Date.now() - start;
    this.timers.delete(id);
    this.info(labels, `${id} finished in ${diff}ms`);
  }

  // Color Helpers
  color(input: ColorInput, ...content: any[]) {
    return colorize(input, this.useColors)(
      content.map(c => formatArg(c, this.useColors)).join(' ')
    );
  }

  hex(hex: `#${string}`, ...content: any[]) {
    return this.color(hex, ...content);
  }

  rgb(rgb: [number, number, number], ...content: any[]) {
    return this.color(rgb, ...content);
  }

  bcolor(input: ColorInput, ...content: any[]) {
    return colorize(input, this.useColors, true)(
      content.map(c => formatArg(c, this.useColors)).join(' ')
    );
  }

  bhex(hex: `#${string}`, ...content: any[]) {
    return this.bcolor(hex, ...content);
  }

  brgb(rgb: [number, number, number], ...content: any[]) {
    return this.bcolor(rgb, ...content);
  }

  strip(...content: any[]) {
    return stripAnsi(
      content.map(c => formatArg(c, this.useColors)).join(' ')
    );
  }


  // Internals
  private print(labels: string[], args: any[]) {
    const mergedLabels = [...this.scopeLabels, ...labels];
    const labelTokens = mergedLabels.map(l => this.formatLabel(l));

    const timestampText = this.timestampFormat
      ? this.timestampFormat(new Date())
      : this.dateFormatter.format(new Date());

    const ts = this.timestamps
      ? `${this.color('grey', `[${timestampText}]`)} `
      : '';

    const prefix = this.prefix
      ? `${this.bcolor('grey', `[${this.prefix}]`)} `
      : '';

    const message = args.map(a => formatArg(a, this.useColors)).join(' ');
    const labelPart = labelTokens.length ? labelTokens.join(' ') + ' ' : '';
    const final = `${ts}${prefix}${labelPart}${message}`;

    console.log(final);
    if (this.file) void appendFile(this.file, final);
    if (this.webhook) void sendWebhook(this.webhook, final);
  }

  private formatLabel(label: string) {
    const color = this.labelMap[label] ?? 'grey';
    return this.bcolor(color, `[${label.toUpperCase()}]`);
  }

  private dateFormatter = new Intl.DateTimeFormat('en-US', {
    hour12: false,
    dateStyle: 'short',
    timeStyle: 'medium'
  });
}
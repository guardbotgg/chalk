import { ApiMethod, ChalkOptions, ColorInput, CronState, LogLabels, LogLevel, ScopedChalkOptions, WSAction } from '../types';
import { appendFile, colorize, formatArg, sendWebhook, stripAnsi } from '../utils';
import { LabelColors } from '../constants';
import path from 'node:path';
import fs from 'node:fs';


export class Chalk {
  private file?: string;
  private webhook?: string;
  private useColors: boolean;
  private timestamps: boolean;
  private timestampFormat?: (date: Date) => string;
  private labels: Record<string, ColorInput> = {};
  
  private prettyLogLabels: LogLabels;
  private prettyLabelStr: string = '';
  private plainLabelStr: string = '';


  constructor(options: ChalkOptions = {}) {
    this.file = options.file;
    this.webhook = options.webhook;
    this.useColors = options.useColors ?? process.stdout.isTTY;
    this.timestamps = options.timestamps ?? true;
    this.timestampFormat = options.timestampFormat;

    for (const label of Object.keys(options.labels ?? {})) {
      let color = options.labels?.[label] ?? 'grey';
      if (color === true) color = LabelColors[label] ?? 'grey';
      const upperLabel = label.toUpperCase();

      this.labels[label] = color;
      this.plainLabelStr += `[${upperLabel}] `;
      this.prettyLabelStr += colorize(color, this.useColors, true)(`[${upperLabel}] `);
    }

    this.prettyLogLabels = {
      info: this.prettyLabelStr + colorize('yellow', this.useColors, true)('[INFO] '),
      warn: this.prettyLabelStr + colorize('orange', this.useColors, true)('[WARN] '),
      error: this.prettyLabelStr + colorize('red', this.useColors, true)('[ERROR] '),
      debug: this.prettyLabelStr + colorize('pink', this.useColors, true)('[DEBUG] '),
      success: this.prettyLabelStr + colorize('green', this.useColors, true)('[SUCCESS] '),
    };

    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    }
  }

  // Scoped Logger
  scope(options: ScopedChalkOptions): Chalk {
    const combinedLabels = { ...this.labels, ...options.scopedLabels };
    const newLabels: Record<string, ColorInput | true> = {};

    for (const label of Object.keys(combinedLabels)) {
      if (options.scopedLabels[label] === false) continue;
      newLabels[label] = options.scopedLabels[label] ?? this.labels[label] ?? 'grey';
    }

    return new Chalk(
      {
        file: options.file ?? this.file,
        webhook: options.webhook ?? this.webhook,
        labels: newLabels,
        useColors: this.useColors,
        timestamps: this.timestamps, 
        timestampFormat: this.timestampFormat,
      }, 
    );
  }

  // Logging Methods
  log(...args: any[]) {
    this.print('log', this.cleanArgs(args), false);
  }

  info(...args: any[]) {
    this.print('info', this.cleanArgs(args), false);
  }

  warn(...args: any[]) {
    this.print('warn', this.cleanArgs(args), true);
  }

  error(...args: any[]) {
    this.print('error', this.cleanArgs(args), true);
  }

  debug(...args: any[]) {
    this.print('debug', this.cleanArgs(args), false);
  }

  success(...args: any[]) {
    this.print('success', this.cleanArgs(args), true);
  }
  

  // Color Helpers
  color(input: ColorInput, ...args: any[]) {
    return colorize(input, this.useColors)(this.cleanArgs(args));
  }

  bcolor(input: ColorInput, ...args: any[]) {
    return colorize(input, this.useColors, true)(this.cleanArgs(args));
  }

  hex(hex: `#${string}`, ...args: any[]) {
    return this.color(hex, ...args);
  }

  rgb(rgb: [number, number, number], ...args: any[]) {
    return this.color(rgb, ...args);
  }

  bhex(hex: `#${string}`, ...args: any[]) {
    return this.bcolor(hex, ...args);
  }

  brgb(rgb: [number, number, number], ...args: any[]) {
    return this.bcolor(rgb, ...args);
  }

  strip(...args: any[]) {
    return args.map(a => stripAnsi(a)).join(' ');
  } 


  // Extra Helpers
  public api(method: ApiMethod, url: string, statusCode: number, durationMs: number) {
    const sc = statusCode >= 500 ? 'red' : statusCode >= 400 ? 'orange' : statusCode >= 300 ? 'cyan' : 'green';
    const mc = method === 'GET' ? 'green' : method === 'POST' ? 'sky' : method === 'DELETE' ? 'red' : 'yellow';
    const msg = `${this.bcolor(mc, `[${method}]`)} ${url} - Status: ${this.bcolor(sc, String(statusCode))} (${durationMs.toFixed(1)}ms)`;
    const prettyLabel = this.bcolor(LabelColors['api'] || 'sky', '[API] ');
    this.print('info', msg, statusCode >= 400, prettyLabel, '[API] ');
  }

  public ws(eventId: string, socketId: string, action: WSAction, desc = '') {
    const ac = action.startsWith('EVENT') ? 'purple' : action === 'CONNECTED' ? 'green' : 'red';
    const msg = `${this.bcolor(ac, `[${action}]`)} Socket: ${this.bcolor('cyan', socketId)} | Id: ${eventId} ${desc ? `- ${desc}` : ''}`;
    const prettyLabel = this.bcolor(LabelColors['ws'] || 'purple', '[WS] ');
    this.print('info', msg, (action === 'CONNECTED' || action === 'DISCONNECTED'), prettyLabel, '[WS] ');
  }

  public cron(jobName: string, state: CronState, message = '') {
    const sc = state === 'SUCCESS' ? 'green' : state === 'FAILED' ? 'red' : 'yellow';
    const msg = `Job: ${this.bcolor('purple', jobName)} -> ${this.bcolor(sc, `[${state}]`)} ${message}`;
    const prettyLabel = this.bcolor(LabelColors['cron'] || 'peach', '[CRON] ');
    this.print(state === 'FAILED' ? 'error' : 'success', msg, state === 'FAILED', prettyLabel, '[CRON] ');
  }


  // Internal Helpers
  private cleanArgs(args: any[]): string {
    return args.map(a => formatArg(a, this.useColors)).join(' ');
  }

  private print(level: LogLevel, rawMessage: string, sendHook: boolean = false, domainPrettyLabel: string = '', domainPlainLabel: string = '') {
    const tsText = this.timestampFormat ? this.timestampFormat(new Date()) : this.dateFormatter.format(new Date());
    const ts = this.timestamps ? `${this.bcolor('grey', `[${tsText}]`)} ` : '';

    const labels = level === 'log' ? this.prettyLabelStr : this.prettyLogLabels[level];
    console.log(`${ts}${domainPrettyLabel}${labels}${rawMessage}`);

    if (this.file || this.webhook) {
      const levelPrefix = level === 'log' ? '' : `[${level.toUpperCase()}] `;
      const cleanOutput = `[${tsText}] ${domainPlainLabel}${this.plainLabelStr}${levelPrefix}${stripAnsi(rawMessage)}`;

      if (this.file) void appendFile(this.file, cleanOutput);
      if (this.webhook && sendHook) void sendWebhook(this.webhook, cleanOutput);
    }
  }

  private dateFormatter = new Intl.DateTimeFormat('en-US', {
    hour12: false,
    dateStyle: 'short',
    timeStyle: 'medium'
  });


  // Color Helpers
  red(...content: any[]) { return this.color('red', ...content); }
  orange(...content: any[]) { return this.color('orange', ...content); }
  yellow(...content: any[]) { return this.color('yellow', ...content); }
  green(...content: any[]) { return this.color('green', ...content); }
  cyan(...content: any[]) { return this.color('cyan', ...content); }
  blue(...content: any[]) { return this.color('blue', ...content); }
  purple(...content: any[]) { return this.color('purple', ...content); }
  violet(...content: any[]) { return this.color('violet', ...content); }
  sky(...content: any[]) { return this.color('sky', ...content); }
  pink(...content: any[]) { return this.color('pink', ...content); }
  peach(...content: any[]) { return this.color('peach', ...content); }
  grey(...content: any[]) { return this.color('grey', ...content); }

  bRed(...content: any[]) { return this.bcolor('red', ...content); }
  bOrange(...content: any[]) { return this.bcolor('orange', ...content); }
  bYellow(...content: any[]) { return this.bcolor('yellow', ...content); }
  bGreen(...content: any[]) { return this.bcolor('green', ...content); }
  bCyan(...content: any[]) { return this.bcolor('cyan', ...content); }
  bBlue(...content: any[]) { return this.bcolor('blue', ...content); }
  bPurple(...content: any[]) { return this.bcolor('purple', ...content); }
  bViolet(...content: any[]) { return this.bcolor('violet', ...content); }
  bSky(...content: any[]) { return this.bcolor('sky', ...content); }
  bPink(...content: any[]) { return this.bcolor('pink', ...content); }
  bPeach(...content: any[]) { return this.bcolor('peach', ...content); }
  bGrey(...content: any[]) { return this.bcolor('grey', ...content); }
}
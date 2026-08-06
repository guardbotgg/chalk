import { ColorInput, ApiMethod, WSAction, CronState, ChalkPinoScopeOptions, ChalkPinoMode, ChalkLogLabels, ChalkPinoOptions, ChalkLevel, LogLevel } from '../types';
import { appendFile, colorize, formatArg, sendWebhook, stripAnsi } from '../utils';
import pino, { Logger as PinoInstance } from 'pino';
import { LabelColors } from '../constants/colors';
import path from 'node:path';
import fs from 'node:fs';


export class ChalkPino {
  private level: ChalkLevel;
  private pinoIns: PinoInstance;
  private pinoMode: ChalkPinoMode;

  private logFile?: string;
  private logWebhook?: string;
  private useColors: boolean;
  private useTimestamps: boolean;
  private timestampFormat?: (date: Date) => string;

  private labelKeys: string[] = [];
  private labels: Record<string, ColorInput> = {};

  private plainLabelsStr = '';
  private pinoLogLabels: ChalkLogLabels;


  constructor(options: ChalkPinoOptions = {}, pinoIns?: PinoInstance) {
    this.level = options.level ?? 'info';
    this.pinoMode = options.mode ?? 'pretty';

    this.logFile = options.logFile;
    this.logWebhook = options.logWebhook;
    this.useColors = options.useColors ?? process.stdout.isTTY;
    this.useTimestamps = options.useTimestamps ?? true;
    this.timestampFormat = options.timestampFormat;

    let pinoLabelStr = '';
    for (const label of Object.keys(options.labels ?? {})) {
      let color = options.labels?.[label] ?? 'grey';
      if (color === true) color = LabelColors[label] ?? 'grey';
      const upperLabel = label.toUpperCase();

      this.labels[label] = color;
      this.plainLabelsStr += `[${upperLabel}] `;
      pinoLabelStr += colorize(color, this.useColors, true)(`[${upperLabel}] `);
    }

    this.labelKeys = Object.keys(this.labels);
    this.pinoLogLabels = {
      log: pinoLabelStr,
      trace: pinoLabelStr + colorize('sky', this.useColors, true)('[TRACE] '),
      debug: pinoLabelStr + colorize('orange', this.useColors, true)('[DEBUG] '),
      info: pinoLabelStr + colorize('yellow', this.useColors, true)('[INFO] '),
      success: pinoLabelStr + colorize('green', this.useColors, true)('[SUCCESS] '),
      warn: pinoLabelStr + colorize('orange', this.useColors, true)('[WARN] '),
      error: pinoLabelStr + colorize('red', this.useColors, true)('[ERROR] '),
      fatal: pinoLabelStr + colorize('red', this.useColors, true)('[FATAL] '),
    };

    if (this.logFile) {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    }

    if (pinoIns && pinoIns.level === this.level) {
      this.pinoIns = pinoIns;
    } else {
      if (this.pinoMode === 'json') this.pinoIns = pino({ level: this.level });
      else this.pinoIns = pino({
        level: this.level,
        transport: {
          target: 'pino-pretty',
          options: {
            ignore: 'pid,hostname,level' + (this.useTimestamps ? '' : ',time'),
          }
        }
      });
    }
  }

  // Scoped Logger
  scope(options: ChalkPinoScopeOptions): ChalkPino {
    const combinedLabels = { ...this.labels, ...options.scopedLabels };
    const newLabels: Record<string, ColorInput | true> = {};

    for (const label of Object.keys(combinedLabels)) {
      if (options.scopedLabels[label] === false) continue;
      newLabels[label] = options.scopedLabels[label] ?? this.labels[label] ?? 'grey';
    }

    return new ChalkPino({
      level: this.level,
      mode: this.pinoMode,
      logFile: options.logFile ?? this.logFile,
      logWebhook: options.logWebhook ?? this.logWebhook,
      useColors: this.useColors,
      useTimestamps: this.useTimestamps,
      timestampFormat: this.timestampFormat,
      labels: newLabels  
    }, this.pinoIns);
  }


  // Logging Methods
  trace(...args: any[]) {
    this.print('trace', 'trace', this.cleanArgs(args), false);
  }

  debug(...args: any[]) {
    this.print('debug', 'debug', this.cleanArgs(args), false);
  }
  
  log(...args: any[]) {
    this.print('log', 'fatal', this.cleanArgs(args), false);
  }

  info(...args: any[]) {
    this.print('info', 'info', this.cleanArgs(args), false);
  }

  success(...args: any[]) {
    this.print('success', 'info', this.cleanArgs(args), true);
  }

  warn(...args: any[]) {
    this.print('warn', 'warn', this.cleanArgs(args), true);
  }

  error(...args: any[]) {
    this.print('error', 'error', this.cleanArgs(args), true);
  }

  fatal(...args: any[]) {
    this.print('fatal', 'fatal', this.cleanArgs(args), true);
  }


  // Color Helpers
  color(color: ColorInput, ...args: any[]) {
    return colorize(color, this.useColors)(this.cleanArgs(args));
  }

  bcolor(color: ColorInput, ...args: any[]) {
    return colorize(color, this.useColors, true)(this.cleanArgs(args));
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

  // Extra Helpers
  public api(method: ApiMethod, url: string, statusCode: number, durationMs: number) {
    const label = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const sc = statusCode >= 500 ? 'red' : statusCode >= 400 ? 'orange' : statusCode >= 300 ? 'cyan' : 'green';
    const mc = method === 'GET' ? 'green' : method === 'POST' ? 'sky' : method === 'DELETE' ? 'red' : 'yellow';
    this.print(
      label, label,
      `${this.bcolor(mc, `[${method}]`)} ${url} - Status: ${this.bcolor(sc, String(statusCode))} (${durationMs.toFixed(1)}ms)`,
      statusCode >= 400,
      this.bcolor(LabelColors['api'] || 'sky', '[API] '), '[API] ',
      { type: 'api', method, url, status: statusCode, duration: durationMs }
    );
  }


  public ws(eventId: string, socketId: string, action: WSAction, desc = '') {
    const label = action === 'DISCONNECTED' ? 'warn' : action === 'CONNECTED' ? 'info' : 'debug';
    const ac = action === 'DISCONNECTED' ? 'orange' : action === 'CONNECTED' ? 'green' : 'purple';
    this.print(
      label, label,
      `${this.bcolor(ac, `[${action}]`)} Socket: ${this.bcolor('cyan', socketId)} | Id: ${eventId} ${desc ? `- ${desc}` : ''}`,
      (action === 'CONNECTED' || action === 'DISCONNECTED'),
      this.bcolor(LabelColors['ws'] || 'purple', '[WS] '), '[WS] ',
      { type: 'ws', eventId, socketId, action, description: desc }
    );
  }

  public cron(jobName: string, state: CronState, message = '') {
    const label = state === 'FAILED' ? 'error' : 'info';
    const sc = state === 'SUCCESS' ? 'green' : state === 'FAILED' ? 'red' : 'yellow';
    this.print(
      label, label,
      `Job: ${this.bcolor('purple', jobName)} -> ${this.bcolor(sc, `[${state}]`)} ${message}`,
      state === 'FAILED',
      this.bcolor(LabelColors['cron'] || 'peach', '[CRON] '), '[CRON] ',
      { type: 'cron', jobName, state, message }
    );
  }


  // Internal Helpers
  private cleanArgs(args: any[]): string {
    return args.map(a => formatArg(a, this.useColors)).join(' ');
  }

  private print(
    level: LogLevel, 
    ChalkLevel: ChalkLevel, 
    rawMessage: string, 
    sendHook: boolean = false, 
    domainPrettyLabel: string = '', 
    domainPlainLabel: string = '', 
    metadata: Record<string, any> = {}
  ) {
    if (this.pinoMode === 'json') this.pinoIns[ChalkLevel]({ scopes: this.labelKeys, loglevel: level, ...metadata }, rawMessage);
    else this.pinoIns[ChalkLevel](`${domainPrettyLabel}${this.pinoLogLabels[level]}${rawMessage}`);

    if (this.logFile || this.logWebhook) {
      const levelPrefix = level === 'log' ? '' : `[${level.toUpperCase()}] `;
      const tsText = this.timestampFormat ? this.timestampFormat(new Date()) : this.dateFormatter.format(new Date());
      const cleanOuput = `[${tsText}] ${domainPlainLabel}${this.plainLabelsStr}${levelPrefix}${stripAnsi(rawMessage)}`;

      if (this.logFile) void appendFile(this.logFile, cleanOuput);
      if (this.logWebhook && sendHook) void sendWebhook(this.logWebhook, cleanOuput);
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
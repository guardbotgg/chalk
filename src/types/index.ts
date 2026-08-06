export type ColorName =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan'
  | 'blue' | 'purple' | 'violet' | 'sky' | 'pink' | 'peach' | 'grey';

  
export type ColorInput =
  | ColorName
  | `#${string}`
  | `rgb(${number},${number},${number})`
  | [number, number, number];


export type ChalkLevel = 
  | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogLevel = 
  | 'trace' | 'debug' | 'log' | 'info' | 'success' | 'warn' | 'error' | 'fatal';

export type ChalkPinoMode = 
  | 'pretty' | 'json';

export type ApiMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type WSAction = 
  | 'CONNECTED' | 'DISCONNECTED' | 'EVENT_IN' | 'EVENT_OUT';

export type CronState = 
  | 'STARTING' | 'SUCCESS' | 'FAILED';


export interface ChalkOptions {
  level?: ChalkLevel;
  logFile?: string;
  logWebhook?: string;
  useColors?: boolean;
  useTimestamps?: boolean;
  timestampFormat?: (date: Date) => string;
  labels?: Record<string, ColorInput | true>;
};

export interface ChalkPinoOptions extends ChalkOptions {
  mode?: 'pretty' | 'json';
};


export interface ChalkScopeOptions {
  level?: ChalkLevel;
  logFile?: string;
  logWebhook?: string;
  scopedLabels: Record<string, ColorInput | true | false>;
};

export interface ChalkPinoScopeOptions extends ChalkScopeOptions {
  mode?: 'pretty' | 'json';
};


export interface ChalkLogLabels {
  log: string;
  trace: string;
  debug: string;
  info: string;
  success: string;
  warn: string;
  error: string;
  fatal: string;
};
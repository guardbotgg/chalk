import { Level } from 'pino';

export type ColorName =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan'
  | 'blue' | 'purple' | 'violet' | 'sky' | 'pink' | 'peach' | 'grey';

  
export type ColorInput =
  | ColorName
  | `#${string}`
  | `rgb(${number},${number},${number})`
  | [number, number, number];


export type PinoMethod = 
  | 'info' | 'warn' | 'error' | 'debug';

export type LogLevel = 
  | 'log' | 'info' | 'warn' | 'error' | 'debug' | 'success';

export type ApiMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type WSAction = 
  | 'CONNECTED' | 'DISCONNECTED' | 'EVENT_IN' | 'EVENT_OUT';

export type CronState = 
  | 'STARTING' | 'SUCCESS' | 'FAILED';


export interface ChalkOptions {
  file?: string;
  webhook?: string;
  useColors?: boolean;
  labels?: Record<string, ColorInput | true>;
  timestamps?: boolean;
  timestampFormat?: (date: Date) => string;
}


export interface PinoChalkOptions extends ChalkOptions {
  level?: Level;
  mode?: 'pretty' | 'json';
}


export interface ScopedChalkOptions {
  file?: string;
  webhook?: string;
  scopedLabels: Record<string, ColorInput | true | false>;
}


export interface LogLabels {
  info: string;
  warn: string;
  error: string;
  debug: string;
  success: string;
}
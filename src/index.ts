import { Chalk } from './core/Chalk';


export default Chalk;
export { Chalk } from './core/Chalk';
export { ChalkError } from './core/ChalkError';
export type { ChalkErrorName } from './core/ChalkError';
export { ColorPalette, LabelColors } from './utils/colors';

export { ConsoleTransport } from './transports/ConsoleTransport';
export { FileTransport } from './transports/FileTransport';
export { WebhookTransport } from './transports/WebhookTransport';
export type { ConsoleTransportOptions } from './transports/ConsoleTransport';
export type { FileTransportOptions } from './transports/FileTransport';
export type { WebhookTransportOptions } from './transports/WebhookTransport';


export type {
  ChalkOptions,
  ConsoleOptions,
  FileOptions,
  WebhookOptions,
  Transport,

  ChalkLevel,
  LogType,
  LogFormat,
  LogRecord,
  Labels,
  Fields,
  OutputStream,
  TimestampOption,
  TimestampStyle,

  ColorInput,
  ColorName,
  ApiMethod,
  WSAction,
  CronState,
} from './types';

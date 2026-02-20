export type ColorName =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan'
  | 'blue' | 'purple' | 'violet' | 'sky'
  | 'pink' | 'peach' | 'grey';

  
export type ColorInput =
  | ColorName
  | `#${string}`
  | `rgb(${number},${number},${number})`
  | [number, number, number];

  
export interface ChalkOptions {
  timestamps?: boolean;
  timestampFormat?: (date: Date) => string;
  useColors?: boolean;
  file?: string;
  webhook?: string;
  prefix?: string;
  labels?: Record<string, ColorInput>;
}
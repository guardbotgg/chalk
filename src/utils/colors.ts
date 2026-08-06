import { ColorPalette } from '../constants/colors';
import { ColorInput, ColorName } from '../types';


export function colorize(input: ColorInput, useColors: boolean = true, bold: boolean = false) {
  if (!useColors) return (t: string) => t;
  const [r, g, b] = parseColor(input);
  return (txt: string) => `\x1b[${bold ? '1;' : ''}38;2;${r};${g};${b}m${txt}\x1b[0m`;
};


export function parseColor(input: ColorInput): [number, number, number] {
  if (Array.isArray(input)) return input;
  if (typeof input !== 'string') return [255, 255, 255];
  const normalized = input.trim().toLowerCase();

  if (ColorPalette[normalized as ColorName]) {
    return ColorPalette[normalized as ColorName];
  }

  if (normalized.startsWith('#')) {
    let hex = normalized.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    return [
      (bigint >> 16) & 255,
      (bigint >> 8) & 255,
      bigint & 255,
    ];
  }

  if (normalized.startsWith('rgb')) {
    const nums = normalized.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
    return [nums[0] ?? 255, nums[1] ?? 255, nums[2] ?? 255];
  }

  return [255, 255, 255];
};
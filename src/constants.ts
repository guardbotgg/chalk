import { ColorName } from "./types";


export const DefaultLabels = {
  client: 'orange',
  cluster: 'cyan',
  manager: 'sky',
  command: 'purple',
  listener: 'yellow',
  shard: 'blue',
  info: 'yellow',
  warn: 'orange',
  error: 'red',
  debug: 'pink',
  success: 'green',
} as const;


export const Palette: Record<ColorName, [number, number, number]> = {
  red: [238, 98, 130],
  orange: [255, 180, 130],
  yellow: [233, 226, 134],
  green: [109, 230, 156],
  cyan: [163, 247, 209],
  blue: [122, 172, 255],
  purple: [175, 164, 255],
  violet: [192, 167, 235],
  sky: [153, 189, 238],
  pink: [255, 149, 167],
  peach: [246, 195, 160],
  grey: [237, 242, 251],
};
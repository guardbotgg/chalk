export { Chalk } from './chalk';
export type { ChalkOptions, ColorInput, ColorName } from './types';
export { DefaultLabels, Palette } from './constants';

import { Chalk } from './chalk';
const chalkIns = new Chalk();
export default chalkIns;
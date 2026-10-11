import { Chalk } from '../build/index.js';
import os from 'node:os';
import pino from 'pino';

const ITERATIONS = 200_000;
const ROUNDS = 5;


const devNull = () => ({ write: () => true });
const fields = { guildId: '800631529351938089', userId: '474255126228500480', members: 4521 };
const error = new Error('Missing Permissions');
error.code = 50013;

const pinoJson = pino({ base: undefined }, devNull());
const chalkJson = new Chalk({ format: 'json', console: { stream: devNull() } });
const chalkPretty = new Chalk({ labels: { client: 'orange' }, colors: true, console: { stream: devNull() } });
const pinoChild = pinoJson.child({ scope: 'client:shard_4' });
const chalkChild = chalkJson.scope('client').scope('shard_4');

const pinoFile = pino({ base: undefined }, pino.destination({ dest: os.devNull, sync: true, minLength: 4096 }));
const chalkFile = new Chalk({ format: 'json', console: false, file: { path: os.devNull, format: 'json' } });
const chalkPrettyFile = new Chalk({ console: false, labels: { client: 'orange' }, file: os.devNull });
const chalkAsyncFile = new Chalk({ format: 'json', console: false, file: { path: os.devNull, format: 'json', sync: false } });

const cases = [
  ['a message', [
    ['pino', () => pinoJson.info('Gateway connected')],
    ['chalk json', () => chalkJson.info('Gateway connected')],
    ['chalk pretty', () => chalkPretty.info('Gateway connected')],
  ]],
  ['a message & fields', [
    ['pino', () => pinoJson.info(fields, 'Member joined')],
    ['chalk json', () => chalkJson.info('Member joined', fields)],
    ['chalk pretty', () => chalkPretty.info('Member joined', fields)],
  ]],
  ['a scoped logger', [
    ['pino', () => pinoChild.info('Gateway connected')],
    ['chalk json', () => chalkChild.info('Gateway connected')],
  ]],
  ['an error', [
    ['pino', () => pinoJson.error({ err: error }, 'Ban failed')],
    ['chalk json', () => chalkJson.error('Ban failed', error)],
    ['chalk pretty', () => chalkPretty.error('Ban failed', error)],
  ]],
  ['a disabled level', [
    ['pino', () => pinoJson.debug(fields, 'Cache miss')],
    ['chalk', () => chalkJson.debug('Cache miss', fields)],
  ]],
  ['to a file', [
    ['pino', () => pinoFile.info(fields, 'Member joined')],
    ['chalk json', () => chalkFile.info('Member joined', fields)],
    ['chalk pretty', () => chalkPrettyFile.info('Member joined')],
    ['chalk async', () => chalkAsyncFile.info('Member joined', fields)],
  ]],
];


async function measure(fn) {
  let best = Infinity;
  for (let round = 0; round < ROUNDS; round++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < ITERATIONS; i++) {
      fn();
      if (i % 1000 === 999) await new Promise(setImmediate);
    }
    best = Math.min(best, Number(process.hrtime.bigint() - start) / ITERATIONS);
  }
  return best;
}

for (const [name, contenders] of cases) {
  console.log(`\nLogging ${name}`);
  for (const [label, fn] of contenders) {
    const ns = await measure(fn);
    console.log(`  ${label.padEnd(14)} ${ns.toFixed(0).padStart(6)} ns/op  ${Math.round(1e9 / ns).toLocaleString('en-US').padStart(12)} ops/s`);
  }
}

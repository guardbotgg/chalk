import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chalk } from '../../build/index.js';
import { createLogger, memoryStream } from './helpers.js';

const TIME = new Date(2026, 8, 26, 19, 2, 33, 7);


describe('pretty format', () => {
  it('writes labels, then the level, then the message', () => {
    const { logger, stream } = createLogger({ labels: { client: 'orange', shard_4: true } });
    logger.info('Gateway connected');
    logger.log('No badge');
    assert.deepEqual(stream.lines, ['[CLIENT] [SHARD_4] [INFO] Gateway connected', '[CLIENT] [SHARD_4] No badge']);
  });

  it('formats timestamps in each style', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: TIME });
    const format = (timestamps) => {
      const { logger, stream } = createLogger({ timestamps });
      logger.log('x');
      return stream.lines[0];
    };
    assert.equal(format(undefined), '[2026-09-26 19:02:33.007] x');
    assert.equal(format('datetime'), '[2026-09-26 19:02:33.007] x');
    assert.equal(format('time'), '[19:02:33.007] x');
    assert.equal(format('iso'), `[${TIME.toISOString()}] x`);
    assert.equal(format((date) => `${date.getFullYear()}!`), '[2026!] x');
    assert.equal(format(false), 'x');
    assert.throws(() => format('unix'), { code: 'InvalidOption' });
  });

  it('keeps timestamps right from one second to the next', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: TIME });
    const { logger, stream } = createLogger({ timestamps: 'time' });
    logger.log('a');
    t.mock.timers.tick(999);
    logger.log('b');
    t.mock.timers.tick(1);
    logger.log('c');
    assert.deepEqual(stream.lines, ['[19:02:33.007] a', '[19:02:34.006] b', '[19:02:34.007] c']);
  });

  it('never throws when a custom timestamp format does', () => {
    const { logger, stream } = createLogger({ timestamps: () => { throw new Error('bad format'); } });
    logger.info('still logged');
    assert.match(stream.lines[0], /^\[\d{4}-\d\d-\d\dT[\d:.]+Z\] \[INFO\] still logged$/);
  });

  it('joins arguments with spaces, inspecting what isn\'t a string', () => {
    const { logger, stream } = createLogger();
    logger.info('Serving', 12, 'guilds', { shards: [0, 1] }, null, undefined, true, 10n);
    assert.equal(stream.lines[0], '[INFO] Serving 12 guilds { shards: [ 0, 1 ] } null undefined true 10n');
  });

  it('shows an error on its own as the message, with its details below', () => {
    const { logger, stream } = createLogger();
    const error = new TypeError('Cannot read properties of undefined');
    error.code = 'E_TEST';
    logger.error(error);
    const [line, extra, frame] = stream.output.split('\n');
    assert.equal(line, '[ERROR] TypeError: Cannot read properties of undefined');
    assert.equal(extra, "    { code: 'E_TEST' }");
    assert.match(frame, /^ {4}at /);
  });

  it('shows errors below the message, with causes, without repeating shared frames', () => {
    const { logger, stream } = createLogger();
    const cause = new Error('socket hang up');
    const error = new Error('Query failed', { cause });
    logger.error('Failed to save the case.', error);

    const lines = stream.output.split('\n');
    assert.equal(lines[0], '[ERROR] Failed to save the case.');
    assert.equal(lines[1], '└─ Error: Query failed');
    const causeLine = lines.findIndex(line => line === '   └─ Caused by: Error: socket hang up');
    assert.ok(causeLine > 1, 'the cause follows the error');
    // The cause's own frame, then the frames it shares with the error
    assert.match(lines[causeLine + 1], /^ {7}at /);
    assert.match(lines[causeLine + 2], /^ {7}… \d+ more, as above$/);
  });

  it('shows aggregated errors, and survives circular causes', () => {
    const { logger, stream } = createLogger();
    const circular = new Error('loop');
    circular.cause = circular;
    logger.error('Several failed.', new AggregateError([new Error('first'), 'second'], 'All failed'), circular);

    const output = stream.output;
    assert.match(output, /└─ AggregateError: All failed/);
    assert.match(output, / {3}└─ Error: first/);
    assert.match(output, / {3}└─ 'second'/);
    assert.match(output, /└─ Error: loop[\s\S]*Caused by: \[Circular\]/);
  });

  it('indents multi-line error messages', () => {
    const { logger, stream } = createLogger();
    logger.error('Query failed.', new Error('Invalid invocation:\nThe table does not exist'));
    assert.deepEqual(stream.output.split('\n').slice(1, 3), ['└─ Error: Invalid invocation:', '   The table does not exist']);
  });

  it('shows fields at the end of the line', () => {
    const { logger, stream } = createLogger({ fields: { app: 'guard' } });
    logger.child({ shard: 4, user: 'Aniket S', tags: ['a'] }).info('Ready');
    assert.equal(stream.lines[0], '[INFO] Ready app=guard shard=4 user="Aniket S" tags=["a"]');
  });

  it('colors labels & levels in truecolor, and follows the terminal\'s color depth', () => {
    const truecolor = createLogger({ colors: undefined, stream: { colorDepth: 24 }, labels: { api: '#ff0000' } });
    truecolor.logger.info('hi');
    assert.equal(truecolor.stream.lines[0], '\x1b[1m\x1b[38;2;255;0;0m[API]\x1b[39m\x1b[22m \x1b[1m\x1b[38;2;122;172;255m[INFO]\x1b[39m\x1b[22m hi');

    const ansi256 = createLogger({ colors: undefined, stream: { colorDepth: 8 }, labels: { api: '#ff0000' } });
    ansi256.logger.log('hi');
    assert.equal(ansi256.stream.lines[0], '\x1b[1m\x1b[38;5;196m[API]\x1b[39m\x1b[22m hi');

    const basic = createLogger({ colors: undefined, stream: { colorDepth: 4 }, labels: { api: '#ff0000' } });
    basic.logger.log('hi');
    assert.equal(basic.stream.lines[0], '\x1b[1m\x1b[91m[API]\x1b[39m\x1b[22m hi');
  });

  it('turns colors off for NO_COLOR, non-terminals & `colors: false`, and on for FORCE_COLOR & `colors: true`', () => {
    const colored = (options) => {
      const { logger, stream } = createLogger({ colors: undefined, ...options });
      // Written immediately, even when the stream isn't a terminal
      logger.fatal('x');
      return stream.output.includes('\x1b[');
    };
    assert.equal(colored({ stream: { colorDepth: 24 } }), true);
    assert.equal(colored({ stream: { isTTY: false } }), false);
    assert.equal(colored({ stream: { colorDepth: 24 }, colors: false }), false);
    assert.equal(colored({ stream: { isTTY: false }, colors: true }), true);
    try {
      process.env.NO_COLOR = '1';
      assert.equal(colored({ stream: { colorDepth: 24 } }), false);
      process.env.FORCE_COLOR = '3';
      assert.equal(colored({ stream: { isTTY: false } }), true);
    } finally {
      delete process.env.NO_COLOR;
      delete process.env.FORCE_COLOR;
    }
  });

  it('still writes a line when a value throws while it\'s formatted', () => {
    const inspectThrows = { [Symbol.for('nodejs.util.inspect.custom')]: () => { throw new Error('no'); } };
    const getterThrows = Object.defineProperty(new Error('boom'), 'cause', { get() { throw new Error('no'); } });
    for (const format of ['pretty', 'json']) {
      const { logger, stream } = createLogger({ format });
      logger.info('before', inspectThrows, 'after');
      logger.error('failed', getterThrows);
      assert.match(stream.lines[0], /before .*after/, format);
      assert.match(stream.output, /\[ERROR\] failed|"msg":"failed/, format);
    }
  });

  it('never colors JSON', () => {
    const stream = memoryStream({ colorDepth: 24 });
    const logger = new Chalk({ format: 'json', colors: true, console: { stream } });
    logger.info(logger.bRed('[TAG]'), 'message');
    assert.equal(stream.output.includes('\x1b'), false);
  });
});

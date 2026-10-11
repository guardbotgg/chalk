import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ChalkDefault, { Chalk, ChalkError, ColorPalette, LabelColors } from '../../build/index.js';
import { createLogger, memoryTransport } from './helpers.js';


describe('scopes & children', () => {
  it('add labels, recolor them, and remove them with false', () => {
    const { logger, stream } = createLogger({ labels: { client: 'orange' } });
    logger.scope('cluster_1').scope({ shard_2: 'blue', client: false }).info('a');
    logger.scope({ client: 'red', manager: true }).info('b');
    assert.deepEqual(stream.lines, ['[CLUSTER_1] [SHARD_2] [INFO] a', '[CLIENT] [MANAGER] [INFO] b']);
  });

  it('share transports, and don\'t change the logger they\'re made from', () => {
    const transport = memoryTransport();
    const { logger } = createLogger({ transports: [transport] });
    const child = logger.child({ guildId: '1' }).child({ shard: 0 });
    child.info('child');
    logger.info('root');
    assert.deepEqual(transport.records.map(record => record.fields), [{ guildId: '1', shard: 0 }, {}]);
  });

  it('stay instances of subclasses', () => {
    class BotLogger extends Chalk {
      ready(tag) { this.log(this.bGreen('[READY]'), tag); }
    }
    const transport = memoryTransport();
    const scoped = new BotLogger({ console: false, transports: [transport] }).scope('client');
    assert.ok(scoped instanceof BotLogger);
    scoped.ready('Guard#0001');
    assert.equal(transport.records[0].message, '[READY] Guard#0001');
  });

  it('work for subclasses whose constructor takes arguments, and keep their properties', () => {
    class BotLogger extends Chalk {
      constructor(client, options) {
        super(options.chalk);
        this.client = client;
      }
      ready() { this.info('Logged in as', this.client.tag); }
    }
    const transport = memoryTransport();
    const logger = new BotLogger({ tag: 'Guard#0001' }, { chalk: { console: false, transports: [transport] } });
    const scoped = logger.scope('client');
    assert.ok(scoped instanceof BotLogger);
    scoped.ready();
    logger.api('GET', '/users', 200, 1);
    assert.deepEqual(transport.records.map(record => record.labels), [['client'], ['api']]);
    assert.equal(transport.records[0].message, 'Logged in as Guard#0001');
  });

  it('give labels named like Object.prototype keys the default color', () => {
    const { logger, stream } = createLogger({ colors: true, stream: { colorDepth: 24 }, labels: { constructor: true } });
    logger.info('a');
    assert.ok(stream.output.startsWith('\x1b[1m\x1b[38;2;237;242;251m[CONSTRUCTOR]'));
  });

  it('explain the v3 scope() when given v2\'s options', () => {
    const { logger } = createLogger();
    assert.throws(() => logger.scope({ scopedLabels: { redis: 'violet' } }), { code: 'LegacyScope' });
    assert.throws(() => logger.scope(''), { code: 'InvalidOption' });
    assert.throws(() => logger.scope('x', 'not-a-color'), { code: 'InvalidColor', message: /"scope\.x"/ });
    assert.throws(() => logger.child('x'), { code: 'InvalidOption' });
  });
});


describe('color methods', () => {
  it('color text when the console is colored', () => {
    const { logger } = createLogger({ colors: undefined, stream: { colorDepth: 24 } });
    assert.equal(logger.red('a'), '\x1b[38;2;238;98;130ma\x1b[39m');
    assert.equal(logger.bGreen('b'), '\x1b[1m\x1b[38;2;109;230;156mb\x1b[39m\x1b[22m');
    assert.equal(logger.hex('#0f0', 'c'), '\x1b[38;2;0;255;0mc\x1b[39m');
    assert.equal(logger.rgb([1, 2, 3], 'd'), '\x1b[38;2;1;2;3md\x1b[39m');
    assert.equal(logger.color('rgb(4, 5, 6)', 'e', 7), '\x1b[38;2;4;5;6me 7\x1b[39m');
    assert.equal(logger.strip(logger.bRed('f'), 'g'), 'f g');
  });

  it('keep the outer color after nested colored text', () => {
    const { logger } = createLogger({ colors: undefined, stream: { colorDepth: 24 } });
    const nested = logger.red(`a ${logger.green('b')} c`);
    assert.equal(nested, '\x1b[38;2;238;98;130ma \x1b[38;2;109;230;156mb\x1b[39m\x1b[38;2;238;98;130m c\x1b[39m');
  });

  it('return plain text without colors, or for invalid colors', () => {
    const { logger } = createLogger();
    assert.equal(logger.bRed('a', { b: 1 }), 'a { b: 1 }');
    const colored = createLogger({ colors: undefined, stream: { colorDepth: 24 } }).logger;
    assert.equal(colored.color('#nope', 'x'), 'x');
    colored.color('1,2,3', 'y');
    assert.equal(colored.rgb([1, 2, 3], 'z'), '\x1b[38;2;1;2;3mz\x1b[39m');
  });
});


describe('exports', () => {
  it('has a default export, and frozen palettes', () => {
    assert.equal(ChalkDefault, Chalk);
    assert.ok(Object.isFrozen(ColorPalette) && Object.isFrozen(ColorPalette.red) && Object.isFrozen(LabelColors));
    assert.ok(new ChalkError('LegacyScope') instanceof TypeError);
  });

  it('rejects invalid options', () => {
    assert.throws(() => new Chalk(null), { code: 'InvalidOption' });
    assert.throws(() => new Chalk({ format: 'xml' }), { code: 'InvalidOption' });
    assert.throws(() => new Chalk({ colors: 'yes' }), { code: 'InvalidOption' });
    assert.throws(() => new Chalk({ labels: { a: 'blurple' } }), { code: 'InvalidColor', message: /"labels\.a"/ });
    assert.throws(() => new Chalk({ labels: [] }), { code: 'InvalidOption' });
    assert.throws(() => new Chalk({ console: 'stdout' }), { code: 'InvalidOption' });
  });
});

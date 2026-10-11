import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { Chalk, ConsoleTransport, FileTransport } from '../../build/index.js';
import { captureWarnings, createLogger, memoryStream, memoryTransport, runScript, tempDir, tick } from './helpers.js';

// Log files always have timestamps, so strip them before comparing
const withoutTimestamps = (text) => text.replace(/^\[\d{4}-\d\d-\d\d [\d:.]+\] /gm, '');


describe('custom transports', () => {
  it('receive records, with the arguments worked out', () => {
    const transport = memoryTransport();
    const { logger } = createLogger({ labels: { client: true }, fields: { app: 'guard' }, transports: [transport] });
    const error = new Error('boom');
    logger.scope('db').warn('Query', { table: 'cases' }, 'failed', error);

    const [record] = transport.records;
    assert.equal(record.type, 'warn');
    assert.equal(record.level, 'warn');
    assert.equal(record.severity, 40);
    assert.equal(typeof record.time, 'number');
    assert.deepEqual(record.labels, ['client', 'db']);
    assert.equal(record.message, 'Query failed');
    assert.equal(record.error, error);
    assert.deepEqual(record.fields, { app: 'guard', table: 'cases' });
    assert.equal(record.args.length, 4);
  });

  it('can\'t break logging by throwing anything, even a Symbol', async () => {
    const { logger, stream } = createLogger({ transports: [{ write() { throw Symbol('odd'); } }] });
    const warnings = await captureWarnings(() => logger.info('still logged'));
    assert.deepEqual(stream.lines, ['[INFO] still logged']);
    assert.match(warnings[0].message, /Symbol\(odd\)/);
  });

  it('can\'t break logging by throwing, and are reported once', async () => {
    const broken = { write() { throw new Error('transport down'); } };
    const { logger, stream } = createLogger({ transports: [broken] });
    const warnings = await captureWarnings(() => {
      logger.info('first');
      logger.info('second');
    });
    assert.deepEqual(stream.lines, ['[INFO] first', '[INFO] second']);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'CHALK_TRANSPORT_FAILED');
    assert.match(warnings[0].message, /transport down/);
  });

  it('are flushed & closed with the logger, even when they fail', async () => {
    const calls = [];
    const transport = { write() {}, flush: async () => calls.push('flush'), close: async () => { calls.push('close'); throw new Error('nope'); } };
    const logger = new Chalk({ console: false, transports: [transport] });
    await logger.flush();
    const warnings = await captureWarnings(() => logger.close());
    assert.deepEqual(calls, ['flush', 'close']);
    assert.equal(warnings.length, 1);
  });

  it('must have a write() method', () => {
    assert.throws(() => new Chalk({ transports: [{}] }), { code: 'InvalidTransport' });
    assert.throws(() => new Chalk({ transports: {} }), { code: 'InvalidOption' });
  });
});


describe('console transport', () => {
  it('writes to terminals right away', () => {
    const { logger, stream } = createLogger();
    logger.info('a');
    assert.equal(stream.writes.length, 1);
  });

  it('writes the lines logged in a task together, to other streams', async () => {
    const { logger, stream } = createLogger({ stream: { isTTY: false } });
    logger.info('a');
    logger.info('b');
    assert.equal(stream.writes.length, 0);
    await tick();
    assert.deepEqual(stream.writes, ['[INFO] a\n[INFO] b\n']);
  });

  it('keeps the order of lines from different loggers writing to the same stream', async () => {
    const stream = memoryStream({ isTTY: false });
    const pretty = new Chalk({ timestamps: false, console: { stream } });
    const json = new Chalk({ format: 'json', console: { stream } });
    pretty.info('one');
    json.info('two');
    pretty.info('three');
    await json.close();
    json.info('four');
    pretty.info('five');
    await tick();
    assert.deepEqual(stream.lines.map(line => (line.startsWith('{') ? JSON.parse(line).msg : line)), ['[INFO] one', 'two', '[INFO] three', 'four', '[INFO] five']);
  });

  it('writes right away after fatal(), as a crash usually follows', () => {
    const { logger, stream } = createLogger({ stream: { isTTY: false } });
    logger.info('a');
    logger.fatal('b');
    assert.deepEqual(stream.writes, ['[INFO] a\n[FATAL] b\n']);
  });

  it('writes what\'s buffered when the process exits, even when it crashes', () => {
    for (const ending of ['throw new Error("crash")', 'process.exit(3)', 'Promise.reject(new Error("rejected"))']) {
      const { stdout, status } = runScript(`
        const logger = new chalk.Chalk({ timestamps: false });
        logger.info('before the crash');
        ${ending};
      `);
      assert.equal(stdout, '[INFO] before the crash\n', ending);
      assert.notEqual(status, 0);
    }
  });

  it('writes lines logged while the process exits', () => {
    for (const ending of ['process.exit(0)', 'setTimeout(() => { throw new Error("crash"); })']) {
      const { stdout } = runScript(`
        const logger = new chalk.Chalk({ timestamps: false });
        process.on('exit', (code) => logger.warn('exiting with code', code));
        logger.info('started');
        ${ending};
      `);
      assert.equal(stdout, `[INFO] started\n[WARN] exiting with code ${ending.startsWith('process') ? 0 : 1}\n`, ending);
    }
  });

  it('can be added as a transport, e.g. for errors on stderr', () => {
    const stdout = memoryStream();
    const stderr = memoryStream();
    const logger = new Chalk({ colors: false, timestamps: false, console: { stream: stdout }, transports: [new ConsoleTransport({ stream: stderr, level: 'error', format: 'json' })] });
    logger.info('fine');
    logger.error('broken');
    assert.deepEqual(stdout.lines, ['[INFO] fine', '[ERROR] broken']);
    assert.deepEqual(stderr.lines.map(line => JSON.parse(line).msg), ['broken']);
  });

  it('can be turned off', () => {
    const transport = memoryTransport();
    const logger = new Chalk({ console: false, transports: [transport] });
    logger.info('only here');
    assert.equal(transport.records.length, 1);
  });
});


describe('file transport', () => {
  let temp;
  before(() => { temp = tempDir('file'); });
  after(() => temp.cleanup());

  it('appends plain lines, creating the folder', async () => {
    const file = path.join(temp.dir, 'nested/folder/bot.log');
    // The console is colored so the tag has color codes, but the file shouldn't
    const logger = new Chalk({ console: { stream: memoryStream({ colorDepth: 24 }) }, timestamps: 'time', labels: { worker: 'orange' }, file });
    logger.info(logger.bGreen('[READY]'), 'Worker pool initialized.');
    assert.ok(logger.bGreen('x').includes('\x1b['));
    logger.warn('Worker #3 stalled.');
    await logger.close();

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    assert.match(lines[0], /^\[\d\d:\d\d:\d\d\.\d{3}\] \[WORKER\] \[INFO\] \[READY\] Worker pool initialized\.$/);
    assert.match(lines[1], /\[WORKER\] \[WARN\] Worker #3 stalled\.$/);
    assert.equal(lines[2], '');
  });

  it('is closed when a later option is invalid', () => {
    const file = path.join(temp.dir, 'invalid.log');
    const open = () => fs.readdirSync('/dev/fd').length;
    const before = open();
    assert.throws(() => new Chalk({ console: false, file, webhook: 'not a url' }), { code: 'InvalidWebhookURL' });
    assert.equal(open(), before);
  });

  it('always has timestamps, and can write JSON', async () => {
    const plain = path.join(temp.dir, 'plain.log');
    const json = path.join(temp.dir, 'json.log');
    const logger = new Chalk({ console: false, timestamps: false, file: plain, transports: [new FileTransport({ path: json, format: 'json', level: 'warn' })] });
    logger.info('info');
    logger.warn('warn');
    await logger.close();

    assert.match(fs.readFileSync(plain, 'utf8'), /^\[\d{4}-\d\d-\d\d [\d:.]+\] \[INFO\] info\n/);
    const lines = fs.readFileSync(json, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(lines.map(line => line.msg), ['warn']);
  });

  it('shares the file between loggers, and keeps working after close()', async () => {
    const file = path.join(temp.dir, 'shared.log');
    const one = new Chalk({ console: false, file });
    const two = new Chalk({ console: false, file: { path: file } });
    one.info('one');
    two.info('two');
    await one.close();
    two.info('three');
    await two.close();
    one.info('after close');
    await one.flush();
    assert.equal(withoutTimestamps(fs.readFileSync(file, 'utf8')), '[INFO] one\n[INFO] two\n[INFO] three\n[INFO] after close\n');
  });

  it('doesn\'t leak file descriptors when writing after close()', async () => {
    const file = path.join(temp.dir, 'reopen.log');
    const openFiles = () => fs.readdirSync('/dev/fd').length;
    const before = openFiles();
    for (let i = 0; i < 20; i++) {
      const logger = new Chalk({ console: false, file });
      await logger.close();
      logger.info(`late ${i}`);
    }
    assert.equal(openFiles(), before);
    assert.equal(withoutTimestamps(fs.readFileSync(file, 'utf8')).split('\n').length, 21);
  });

  it('writes what\'s buffered when the process crashes', () => {
    const file = path.join(temp.dir, 'crash.log');
    runScript(`
      const logger = new chalk.Chalk({ console: false, file: ${JSON.stringify(file)} });
      logger.error('last words');
      throw new Error('crash');
    `);
    assert.equal(withoutTimestamps(fs.readFileSync(file, 'utf8')), '[ERROR] last words\n');
  });

  it('writes in the background with sync: false, keeping the order', async () => {
    const file = path.join(temp.dir, 'async.log');
    const logger = new Chalk({ console: false, file: { path: file, format: 'json', sync: false } });
    for (let i = 0; i < 2000; i++) {
      logger.info(`line ${i}`);
      if (i % 100 === 0) await tick();
    }
    await logger.flush();
    const messages = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line).msg);
    assert.deepEqual(messages, Array.from({ length: 2000 }, (_, i) => `line ${i}`));
    await logger.close();
  });

  it('writes fatal() right away, and closes the file once written, with sync: false', async () => {
    const file = path.join(temp.dir, 'async-fatal.log');
    const openFiles = () => fs.readdirSync('/dev/fd').length;
    const before = openFiles();
    const logger = new Chalk({ console: false, timestamps: false, file: { path: file, sync: false } });
    logger.info('a');
    await logger.flush();
    logger.fatal('b');
    assert.equal(withoutTimestamps(fs.readFileSync(file, 'utf8')), '[INFO] a\n[FATAL] b\n');
    for (let i = 0; i < 500; i++) logger.info(`c${i}`);
    await logger.close();
    assert.equal(openFiles(), before);
    assert.equal(withoutTimestamps(fs.readFileSync(file, 'utf8')).split('\n').length, 503);
  });

  it('writes what\'s buffered when the process exits, with sync: false', () => {
    const file = path.join(temp.dir, 'async-exit.log');
    runScript(`
      const logger = new chalk.Chalk({ console: false, file: { path: ${JSON.stringify(file)}, sync: false } });
      for (let i = 0; i < 1000; i++) logger.info('line ' + i);
      process.exit(0);
    `);
    assert.equal(withoutTimestamps(fs.readFileSync(file, 'utf8')).split('\n').length, 1001);
  });

  it('fails when the logger is created, if the file can\'t be opened', () => {
    const blocker = path.join(temp.dir, 'not-a-folder');
    fs.writeFileSync(blocker, '');
    assert.throws(() => new Chalk({ console: false, file: path.join(blocker, 'bot.log') }), { code: /^(EEXIST|ENOTDIR)$/ });
    assert.throws(() => new Chalk({ file: { path: '' } }), { code: 'InvalidOption' });
    assert.throws(() => new Chalk({ file: { path: path.join(temp.dir, 'x.log'), sync: 'no' } }), { code: 'InvalidOption', message: /"file\.sync"/ });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Chalk, ChalkError } from '../../build/index.js';
import { createLogger, memoryTransport } from './helpers.js';


describe('levels', () => {
  it('logs its level and the ones above it, at info by default', () => {
    const { logger, stream } = createLogger();
    logger.trace('trace');
    logger.debug('debug');
    logger.info('info');
    logger.success('success');
    logger.log('log');
    logger.warn('warn');
    logger.error('error');
    logger.fatal('fatal');
    assert.deepEqual(stream.lines, ['[INFO] info', '[SUCCESS] success', 'log', '[WARN] warn', '[ERROR] error', '[FATAL] fatal']);
    assert.equal(logger.level, 'info');
  });

  it('logs nothing when silent', () => {
    const { logger, stream } = createLogger({ level: 'silent' });
    logger.fatal('fatal');
    logger.log('log');
    assert.deepEqual(stream.lines, []);
  });

  it('changes level at runtime, for the scopes that share it', () => {
    const { logger, stream } = createLogger();
    const redis = logger.scope('redis');
    logger.level = 'debug';
    redis.debug('now visible');
    logger.level = 'warn';
    redis.info('hidden');
    assert.deepEqual(stream.lines, ['[REDIS] [DEBUG] now visible']);
  });

  it('keeps a scope\'s own level once it has one', () => {
    const { logger, stream } = createLogger();
    const noisy = logger.scope('noisy');
    noisy.level = 'error';
    noisy.warn('hidden');
    logger.level = 'debug';
    noisy.warn('still hidden');
    logger.debug('root debug');
    assert.equal(noisy.level, 'error');
    assert.deepEqual(stream.lines, ['[DEBUG] root debug']);
  });

  it('makes scopes follow the closest level set above them', () => {
    const { logger, stream } = createLogger();
    const db = logger.scope('db');
    const query = db.scope('query');
    db.level = 'error';
    query.warn('hidden: db is at error');
    assert.equal(query.level, 'error');
    logger.level = 'trace';
    query.debug('still hidden');
    db.error('shown');
    query.level = 'debug';
    query.debug('its own level now');
    assert.deepEqual(stream.lines, ['[DB] [ERROR] shown', '[DB] [QUERY] [DEBUG] its own level now']);
  });

  it('isLevelEnabled() takes levels & methods', () => {
    const { logger } = createLogger({ level: 'warn' });
    assert.equal(logger.isLevelEnabled('info'), false);
    assert.equal(logger.isLevelEnabled('success'), false);
    assert.equal(logger.isLevelEnabled('warn'), true);
    assert.equal(logger.isLevelEnabled('fatal'), true);
    assert.equal(logger.isLevelEnabled('silent'), false);
  });

  it('gives each transport its own minimum level, above the logger\'s', () => {
    const errors = memoryTransport({ level: 'error' });
    const all = memoryTransport();
    const { logger, stream } = createLogger({ level: 'debug', console: { level: 'warn' }, transports: [errors, all] });
    logger.debug('debug');
    logger.warn('warn');
    logger.error('error');
    assert.deepEqual(stream.lines, ['[WARN] warn', '[ERROR] error']);
    assert.deepEqual(errors.records.map(r => r.message), ['error']);
    assert.deepEqual(all.records.map(r => r.message), ['debug', 'warn', 'error']);
  });

  it('doesn\'t create records no transport takes', () => {
    let calls = 0;
    const transport = { level: 'error', write: () => calls++ };
    const logger = new Chalk({ console: false, level: 'trace', transports: [transport] });
    assert.equal(logger.isLevelEnabled('warn'), false);
    logger.warn('skipped');
    logger.error('kept');
    assert.equal(calls, 1);
  });

  it('rejects unknown levels', () => {
    assert.throws(() => new Chalk({ level: 'verbose' }), (error) => error instanceof ChalkError && error.code === 'InvalidLevel' && /"level"/.test(error.message));
    const { logger } = createLogger();
    assert.throws(() => { logger.level = 'loud'; }, { code: 'InvalidLevel' });
    assert.throws(() => new Chalk({ console: { level: 'x' } }), { code: 'InvalidLevel', message: /console\.level/ });
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, jsonLines, memoryTransport } from './helpers.js';

const json = (options = {}) => createLogger({ format: 'json', level: 'trace', ...options });


describe('json format', () => {
  it('writes one JSON object per line, with its level, time, scope & message', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 8, 26, 13, 32, 33, 412) });
    const { logger, stream } = json({ labels: { client: 'orange' } });
    logger.scope('shard_4').info('Gateway connected');
    assert.equal(stream.output, '{"level":"info","time":"2026-09-26T13:32:33.412Z","scope":"client:shard_4","msg":"Gateway connected"}\n');
  });

  it('logs success & log at the info level', () => {
    const { logger, stream } = json();
    logger.success('a');
    logger.log('b');
    logger.trace('c');
    logger.fatal('d');
    assert.deepEqual(jsonLines(stream).map(line => line.level), ['info', 'info', 'trace', 'fatal']);
  });

  it('keeps __proto__ keys as fields, without changing the fields\' prototype', () => {
    const transport = memoryTransport();
    const { logger, stream } = json({ fields: { app: 'guard' }, transports: [transport] });
    logger.info('payload', JSON.parse('{"__proto__": {"admin": true}, "user": 1}'));
    const { fields } = transport.records[0];
    assert.equal(Object.getPrototypeOf(fields), Object.prototype);
    assert.equal(fields.admin, undefined);
    assert.deepEqual(Object.keys(fields), ['app', '__proto__', 'user']);
    assert.match(stream.output, /"__proto__":\{"admin":true\}/);
  });

  it('merges plain objects & the logger\'s fields into the line', () => {
    const { logger, stream } = json({ fields: { app: 'guard' } });
    logger.child({ shard: 4 }).info('Joined', { guildId: '123' }, 'a guild', { members: 42 });
    const [line] = jsonLines(stream);
    assert.equal(line.msg, 'Joined a guild');
    assert.deepEqual({ app: line.app, shard: line.shard, guildId: line.guildId, members: line.members }, { app: 'guard', shard: 4, guildId: '123', members: 42 });
  });

  it('prefixes fields named like the line\'s own keys, so none are lost', () => {
    const { logger, stream } = json({ labels: { api: true } });
    logger.info('User leveled up', { level: 5, time: 'now', msg: 'hi', scope: 'x' });
    const [line] = jsonLines(stream);
    assert.equal(line.level, 'info');
    assert.equal(line.scope, 'api');
    assert.deepEqual([line._level, line._time, line._msg, line._scope], [5, 'now', 'hi', 'x']);
  });

  it('prefixes an err field when an error is logged too', () => {
    const { logger, stream } = json();
    logger.error('Request failed', { err: 'E_TIMEOUT' }, new Error('upstream'));
    logger.child({ err: 'from child' }).error(new Error('boom'));
    logger.info('No error', { err: 'kept' });
    const lines = jsonLines(stream);
    assert.deepEqual(lines.map(line => [line._err, line.err?.message ?? line.err]), [['E_TIMEOUT', 'upstream'], ['from child', 'boom'], [undefined, 'kept']]);
    assert.equal(stream.lines[0].match(/"err":/g).length, 1);
  });

  it('serializes errors like pino, with their cause, properties & aggregated errors', () => {
    const { logger, stream } = json();
    const cause = new RangeError('too far');
    const error = new Error('Request failed', { cause });
    error.status = 403;
    logger.error('Couldn\'t ban the member.', error);
    logger.error(new AggregateError([new Error('a')], 'Many failed'));

    const [first, second] = jsonLines(stream);
    assert.equal(first.msg, 'Couldn\'t ban the member.');
    assert.equal(first.err.type, 'Error');
    assert.equal(first.err.message, 'Request failed');
    assert.equal(first.err.status, 403);
    assert.match(first.err.stack, /^Error: Request failed\n {4}at /);
    assert.deepEqual([first.err.cause.type, first.err.cause.message], ['RangeError', 'too far']);
    // If only an error is logged, its message becomes msg
    assert.equal(second.msg, 'Many failed');
    assert.equal(second.err.errors[0].message, 'a');
  });

  it('never throws on values JSON can\'t represent', () => {
    const { logger, stream } = json();
    const circular = { name: 'loop' };
    circular.self = circular;
    const cyclicError = new Error('cycle');
    cyclicError.cause = cyclicError;
    logger.info('values', { big: 10n, map: new Map([['a', 1]]), set: new Set([1, 2]), circular, nested: { error: new Error('inner') }, cyclicError, fn: () => {} });

    const [line] = jsonLines(stream);
    assert.equal(line.big, '10');
    assert.deepEqual(line.map, { a: 1 });
    assert.deepEqual(line.set, [1, 2]);
    assert.deepEqual(line.circular, { name: 'loop', self: '[Circular]' });
    assert.equal(line.nested.error.message, 'inner');
    assert.equal(line.cyclicError.cause, '[Circular]');
    assert.equal('fn' in line, false);
  });

  it('writes other values & colored text as plain text in the message', () => {
    const { logger, stream } = json({ colors: true });
    logger.info('\x1b[1m\x1b[32m[READY]\x1b[39m\x1b[22m', 'Serving', 12, ['a', 'b'], new Map([[1, 2]]), null);
    assert.equal(jsonLines(stream)[0].msg, "[READY] Serving 12 [ 'a', 'b' ] Map(1) { 1 => 2 } null");
  });

  it('escapes messages', () => {
    const { logger, stream } = json();
    logger.info('line one\nline "two"\t');
    assert.equal(stream.lines.length, 1);
    assert.equal(jsonLines(stream)[0].msg, 'line one\nline "two"\t');
  });

  it('adds the helpers\' details as fields', () => {
    const { logger, stream } = json();
    logger.api('POST', '/api/login', 401, 8.72);
    logger.ws('GUILD_CREATE', 'socket-1', 'DISCONNECTED', 'Resuming');
    logger.cron('cleanup', 'FAILED', 'Timed out');
    const [api, ws, cron] = jsonLines(stream);
    assert.deepEqual(api, { ...api, level: 'warn', scope: 'api', msg: 'POST /api/login 401 8.7ms', method: 'POST', url: '/api/login', status: 401, duration: 8.72 });
    assert.deepEqual(ws, { ...ws, level: 'warn', scope: 'ws', msg: 'Socket socket-1 DISCONNECTED (GUILD_CREATE): Resuming', action: 'DISCONNECTED', socketId: 'socket-1', eventId: 'GUILD_CREATE', description: 'Resuming' });
    assert.deepEqual(cron, { ...cron, level: 'error', scope: 'cron', msg: 'Job cleanup FAILED: Timed out', job: 'cleanup', state: 'FAILED', description: 'Timed out' });
  });

  it('leaves out empty helper descriptions, and gives transports the plain message', () => {
    const transport = memoryTransport();
    const { logger, stream } = json({ transports: [transport] });
    logger.ws('READY', 'socket-1', 'CONNECTED');
    logger.cron('cleanup', 'STARTING');
    const [ws, cron] = jsonLines(stream);
    assert.equal(ws.msg, 'Socket socket-1 CONNECTED (READY)');
    assert.equal(cron.msg, 'Job cleanup STARTING');
    assert.ok(!('description' in ws) && !('description' in cron));
    assert.deepEqual(transport.records.map(record => record.message), [ws.msg, cron.msg]);
  });
});

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Chalk, WebhookTransport } from '../../build/index.js';
import { captureWarnings, mockFetch, runScript, sleep } from './helpers.js';

const URL = 'https://discord.com/api/webhooks/123456/SECRET-TOKEN';
const create = (options = {}, loggerOptions = {}) => new Chalk({ console: false, level: 'trace', webhook: { url: URL, interval: 0, ...options }, ...loggerOptions });


describe('webhook transport', () => {
  let fetchMock;
  afterEach(() => fetchMock?.restore());

  it('sends warnings & errors as embeds, and never pings anyone', async () => {
    fetchMock = mockFetch();
    const logger = create();
    logger.info('not sent');
    logger.scope('client').warn('Missing permissions in the @everyone channel');
    await logger.flush();

    assert.equal(fetchMock.requests.length, 1);
    const [{ url, init, body }] = fetchMock.requests;
    assert.equal(url, URL);
    assert.equal(init.method, 'POST');
    assert.deepEqual(body.allowed_mentions, { parse: [] });
    assert.deepEqual(body.embeds, [{
      title: '⚠️ [CLIENT] [WARN]',
      description: '```\nMissing permissions in the @everyone channel\n```',
      color: 0xFFB482,
      timestamp: body.embeds[0].timestamp,
    }]);
    assert.match(body.embeds[0].timestamp, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
  });

  it('sends error details & fields, from the level it\'s given', async () => {
    fetchMock = mockFetch();
    const logger = create({ level: 'info', username: 'Logs', avatarURL: 'https://example.com/logs.png', threadId: '999' });
    logger.child({ guildId: '1' }).info('Joined a guild');
    logger.error('Failed.', new Error('boom'));
    await logger.flush();

    const [{ url, body }] = fetchMock.requests;
    assert.equal(url, `${URL}?thread_id=999`);
    assert.equal(body.username, 'Logs');
    assert.equal(body.avatar_url, 'https://example.com/logs.png');
    assert.equal(body.embeds[0].description, '```\nJoined a guild guildId=1\n```');
    assert.match(body.embeds[1].description, /^```\nFailed\.\n└─ Error: boom\n {4}at /);
  });

  it('sends up to 10 embeds per message, and repeated records once', async () => {
    fetchMock = mockFetch();
    const logger = create();
    for (let i = 0; i < 12; i++) logger.error(`error ${i}`);
    for (let i = 0; i < 5; i++) logger.error('again');
    await logger.flush();

    assert.deepEqual(fetchMock.requests.map(request => request.body.embeds.length), [10, 3]);
    assert.deepEqual(fetchMock.requests[1].body.embeds[2].footer, { text: 'Repeated 5 times' });
  });

  it('waits & retries when rate limited', async () => {
    fetchMock = mockFetch((_request, count) => (count === 1
      ? new Response(JSON.stringify({ retry_after: 0.01, global: false }), { status: 429 })
      : new Response(null, { status: 204 })));
    const logger = create();
    logger.error('once');
    await logger.flush();

    assert.equal(fetchMock.requests.length, 2);
    assert.deepEqual(fetchMock.requests[0].body, fetchMock.requests[1].body);
  });

  it('stops sending to a deleted webhook, and never reveals its token', async () => {
    fetchMock = mockFetch(() => new Response('{"message": "Unknown Webhook", "code": 10015}', { status: 404 }));
    const logger = create();
    const warnings = await captureWarnings(async () => {
      logger.error('one');
      await logger.flush();
      logger.error('two');
      await logger.flush();
    });

    assert.equal(fetchMock.requests.length, 1);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'CHALK_WEBHOOK_INVALID');
    assert.match(warnings[0].message, /webhooks\/123456\/\*\*\*/);
    assert.doesNotMatch(warnings[0].message, /SECRET/);
  });

  it('keeps messages within Discord\'s limits', async () => {
    fetchMock = mockFetch();
    const logger = create();
    logger.error('x'.repeat(10_000));
    logger.error('Run ```js\nevil()\n``` to break out');
    await logger.flush();

    const [long, fenced] = fetchMock.requests.flatMap(request => request.body.embeds);
    assert.ok(long.description.length <= 4096);
    assert.match(long.description, /x\n… \(truncated\)\n```$/);
    // Only the code block's own fences
    assert.equal(fenced.description.split('```').length, 3);
    for (const { body } of fetchMock.requests) {
      assert.ok(body.embeds.reduce((size, embed) => size + embed.title.length + embed.description.length, 0) <= 6000);
    }
  });

  it('drops what Discord can\'t keep up with, and says how much', async () => {
    fetchMock = mockFetch();
    const logger = create();
    for (let i = 0; i < 105; i++) logger.error(`error ${i}`);
    await logger.flush();

    assert.equal(fetchMock.requests.flatMap(request => request.body.embeds).length, 100);
    assert.match(fetchMock.requests[0].body.content, /^⚠️ 5 more logs were dropped/);
  });

  it('can be added as a transport', async () => {
    fetchMock = mockFetch();
    const logger = new Chalk({ console: false, transports: [new WebhookTransport({ url: URL, level: 'fatal', interval: 0 })] });
    logger.error('not sent');
    logger.fatal('sent');
    await logger.flush();
    assert.deepEqual(fetchMock.requests.map(request => request.body.embeds[0].title), ['💀 [FATAL]']);
  });

  it('rejects invalid options, without revealing the token', () => {
    assert.throws(() => new Chalk({ webhook: 'not a url' }), { code: 'InvalidWebhookURL' });
    assert.throws(
      () => new Chalk({ webhook: 'ftp://discord.com/api/webhooks/1/SECRET' }),
      (error) => error.code === 'InvalidWebhookURL' && !error.message.includes('SECRET'),
    );
    assert.throws(() => new Chalk({ webhook: { url: URL, interval: -1 } }), { code: 'InvalidOption' });
    assert.throws(() => new Chalk({ webhook: { url: URL, level: 'loud' } }), { code: 'InvalidLevel' });
  });

  it('resolves flush() once what was logged before it is sent, even while logging goes on', async () => {
    fetchMock = mockFetch(async () => {
      await sleep(30);
      return new Response(null, { status: 204 });
    });
    const logger = create({ interval: 20 });
    let attempt = 0;
    const noisy = setInterval(() => logger.warn(`reconnecting, attempt ${++attempt}`), 5);
    try {
      logger.error('shutting down');
      const started = Date.now();
      await logger.flush();
      assert.ok(Date.now() - started < 1000);
      assert.equal(fetchMock.requests[0].body.embeds[0].description, '```\nshutting down\n```');
    } finally {
      clearInterval(noisy);
    }
  });

  it('waits for rate limits before the next message, not after the last one', async () => {
    fetchMock = mockFetch(() => new Response(null, { status: 204, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '30' } }));
    const logger = create();
    logger.error('one');
    const started = Date.now();
    await logger.flush();
    assert.ok(Date.now() - started < 1000);
  });

  it('gives up on an unreachable webhook, without keeping the process alive', () => {
    const started = Date.now();
    const { stdout } = runScript(`
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
      const logger = new chalk.Chalk({ console: false, webhook: ${JSON.stringify(URL)} });
      for (let i = 0; i < 100; i++) logger.error('job ' + i + ' failed');
      process.on('exit', () => console.log(calls));
    `);
    // 3 tries, 1s and 2s apart. Then sending pauses and the flush gives up on the rest.
    assert.equal(stdout, '3\n');
    assert.ok(Date.now() - started < 5000);
  });

  it('keeps sending after close()', async () => {
    fetchMock = mockFetch();
    const logger = create();
    logger.error('before');
    await logger.close();
    logger.error('after');
    await logger.flush();
    assert.deepEqual(fetchMock.requests.map(request => request.body.embeds[0].description), ['```\nbefore\n```', '```\nafter\n```']);
  });

  it('counts footers in the message size', async () => {
    fetchMock = mockFetch();
    const logger = create();
    // 10 embeds fit without the "Repeated 2 times" footers, but not with them
    for (let i = 0; i < 10; i++) {
      const message = `${i}`.padEnd(580, 'x');
      logger.error(message);
      logger.error(message);
    }
    await logger.flush();
    for (const { body } of fetchMock.requests) {
      const size = body.embeds.reduce((sum, embed) => sum + embed.title.length + embed.description.length + (embed.footer?.text.length ?? 0), 0);
      assert.ok(size <= 6000, `${size} characters`);
    }
    assert.equal(fetchMock.requests.flatMap(request => request.body.embeds).length, 10);
  });

  it('keeps runs of backticks from ending the code block', async () => {
    fetchMock = mockFetch();
    const logger = create();
    logger.error('````js\nbreak()\n`````');
    await logger.flush();
    assert.equal(fetchMock.requests[0].body.embeds[0].description.match(/```/g).length, 2);
  });

  it('takes URL objects, and never shows the token in errors', () => {
    fetchMock = mockFetch();
    assert.doesNotThrow(() => new Chalk({ console: false, webhook: new globalThis.URL(URL) }));
    assert.doesNotThrow(() => new Chalk({ console: false, webhook: { url: new globalThis.URL(URL) } }));
    for (const url of [{ href: URL }, 42, ['x']]) {
      assert.throws(() => new Chalk({ webhook: { url } }), (error) => error.code === 'InvalidWebhookURL' && !error.message.includes('SECRET'));
    }
  });

  it('is off for empty values, e.g. an unset environment variable', () => {
    assert.doesNotThrow(() => new Chalk({ console: false, webhook: '', file: '' }));
    assert.doesNotThrow(() => new Chalk({ console: false, webhook: false, file: false }));
  });

  it('sends what\'s waiting before the process runs out of work', () => {
    const { stdout } = runScript(`
      globalThis.fetch = async (url, init) => {
        console.log('sent', JSON.parse(init.body).embeds[0].description);
        return new Response(null, { status: 204 });
      };
      const logger = new chalk.Chalk({ console: false, webhook: { url: ${JSON.stringify(URL)}, interval: 60000 } });
      logger.error('last error');
    `);
    assert.equal(stdout, 'sent ```\nlast error\n```\n');
  });
});

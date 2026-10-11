// Type tests. `yarn typecheck` fails if the public types break.
import Default, { Chalk, ChalkError, ConsoleTransport, FileTransport, WebhookTransport, type ChalkLevel, type ColorInput, type LogRecord, type Transport } from '../../src';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const assert = <T extends true>() => {};


// Options
const logger = new Chalk({
  level: 'debug',
  format: 'pretty',
  colors: true,
  timestamps: (date) => date.toISOString(),
  labels: { client: 'orange', shard: true, custom: '#4ADE80', rgb: 'rgb(1, 2, 3)', tuple: [1, 2, 3] },
  fields: { app: 'guard' },
  console: { stream: process.stderr, level: 'info' },
  file: { path: './logs/bot.log', level: 'warn', format: 'json' },
  webhook: { url: 'https://discord.com/api/webhooks/1/token', level: 'error', username: 'Logs', threadId: '1', interval: 1000 },
  transports: [new ConsoleTransport({ format: 'json' }), new FileTransport({ path: './a.log' }), new WebhookTransport({ url: 'https://x' })],
});
new Chalk();
new Chalk({ console: false, file: './bot.log', webhook: 'https://discord.com/api/webhooks/1/token', timestamps: 'time' });
// @ts-expect-error not a level
new Chalk({ level: 'verbose' });
// @ts-expect-error not a format
new Chalk({ format: 'xml' });
// @ts-expect-error not a color
new Chalk({ labels: { client: 'blurple' } });
// @ts-expect-error v2's option names are gone
new Chalk({ logFile: './bot.log' });
assert<Equals<typeof Default, typeof Chalk>>();


// Log methods take anything and return nothing
logger.info('text', 1, { a: 1 }, new Error('x'), null, undefined);
assert<Equals<ReturnType<typeof logger.fatal>, void>>();
assert<Equals<typeof logger.level, ChalkLevel>>();
logger.level = 'silent';
// @ts-expect-error not a level
logger.level = 'loud';
const enabled: boolean = logger.isLevelEnabled('success');


// Scopes and children keep the subclass type
class BotLogger extends Chalk {
  ready(tag: string) {
    this.log(this.bGreen('[READY]'), tag);
  }
}
const bot = new BotLogger();
bot.scope('client').ready('Guard#0001');
bot.scope({ shard_4: 'cyan', client: false }).child({ shard: 4 }).ready('Guard#0001');
assert<Equals<ReturnType<typeof bot.scope>, BotLogger>>();
// @ts-expect-error only the object form accepts `false`
bot.scope('client', false);


// Helpers and colors
logger.api('GET', '/users', 200, 18.4);
logger.api('PURGE', '/cache', 200, 1);
logger.ws('READY', 'socket-1', 'CONNECTED', 'Gateway connection established');
logger.cron('cleanup', 'SUCCESS');
// @ts-expect-error not a state
logger.cron('cleanup', 'DONE');
const colored: string = logger.bRed('a') + logger.hex('#fff', 'b') + logger.rgb([1, 2, 3], 'c') + logger.color('sky', 'd') + logger.strip('e');
const color: ColorInput = 'violet';


// Custom transports
const transport: Transport = {
  level: 'error',
  write(record: LogRecord) {
    assert<Equals<typeof record.level, 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'>>();
    const text: string = record.message;
    const error: Error | undefined = record.error;
    const labels: readonly string[] = record.labels;
  },
};
new Chalk({ transports: [transport] });

const error = new ChalkError('InvalidLevel', 'level', 'x');
assert<Equals<typeof error.code, 'InvalidLevel'>>();
void logger.flush();
void logger.close();

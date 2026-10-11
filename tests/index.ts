import { Chalk, type LogRecord, type Transport } from '../src';


const logger = new Chalk({
  level: 'trace',
  labels: { system: 'sky' },
  webhook: process.env.WEBHOOK_URL,
});

const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' });
const heading = new Chalk({ timestamps: false });
const section = (title: string) => heading.log(heading.bOrange(`\n━━━ ${title} ━━━`));


section('1. Levels');
logger.trace('Resolving configuration from the environment...');
logger.debug('Current system allocation tables:', { activeThreads: 4, memoryHeapMb: 142 });
logger.info('Booting core engine services...');
logger.success('System dependencies validated successfully.');
logger.warn('High memory threshold detected on sub-process.');
logger.error('Failed to locate secondary recovery node.', new Error('CONNECTION_TIMEOUT', { cause }));
logger.fatal(new TypeError("Cannot read properties of undefined (reading 'guild')"));


section('2. Scopes & fields');
const cluster = logger.scope('cluster_1', 'purple');
const shard = cluster.scope({ shard_2: 'blue' }).child({ shard: 2 });
shard.log(shard.bGreen('[CONNECTED]'), 'Gateway connection established.');
shard.scope('command_ping', 'peach').debug('Evaluating round-trip latency:', 42, 'ms');
logger.scope({ system: false, database: true }).info('Scopes can remove & recolor labels too.');


section('3. Helpers');
const gateway = logger.scope('network', 'violet');
gateway.api('GET', '/api/v10/guilds/1144589224520192001/members', 200, 14.2);
gateway.api('POST', '/api/v10/auth/login', 401, 8.7);
gateway.ws('GUILD_CREATE', 'ws_session_x99', 'CONNECTED', 'Shard matching completed');
gateway.cron('database-vacuum', 'SUCCESS', 'Purged 420 expired rows');


section('4. Colors');
logger.log(
  logger.red('red'), logger.orange('orange'), logger.yellow('yellow'), logger.green('green'), logger.cyan('cyan'), logger.blue('blue'),
  logger.purple('purple'), logger.violet('violet'), logger.sky('sky'), logger.pink('pink'), logger.peach('peach'), logger.grey('grey'),
);
logger.log(logger.bRed('bold'), logger.hex('#4ADE80', 'hex'), logger.rgb([255, 100, 50], 'rgb'), logger.red(`nested ${logger.bGreen('colors')} work`));


section('5. JSON');
const json = new Chalk({ format: 'json', labels: { system: 'sky' }, fields: { app: 'guard' } });
json.info('Booting core engine services...');
json.scope('shard_2').child({ shard: 2 }).warn('Resuming session', { sequence: 1337 });
json.error('Failed to locate secondary recovery node.', new Error('CONNECTION_TIMEOUT', { cause }));


section('6. Files & transports');
const records: LogRecord[] = [];
const memory: Transport = { level: 'warn', write: (record) => records.push(record) };
const worker = new Chalk({ labels: { worker_core: 'orange' }, file: './logs/chalk.log', transports: [memory] });
worker.info('Background worker pool initialized.');
worker.warn('Job worker thread #3 stalled. Re-queueing tasks.');
logger.info(`The transport got ${records.length} record(s):`, records.map(record => record.message));
logger.info('Lines were appended to', logger.bSky('./logs/chalk.log'));


await Promise.all([logger.close(), worker.close()]);

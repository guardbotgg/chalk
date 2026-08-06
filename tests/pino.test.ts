import { ChalkPino } from '../src/index';

const chalkPino = new ChalkPino({
  mode: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  useTimestamps: true,
  labels: { system: 'sky' }
});


chalkPino.log('--- 1. Global Root Logger --- \n');
chalkPino.info('Booting core engine services...');
chalkPino.success('System dependencies validated successfully.');
chalkPino.warn('High memory threshold detected on sub-process.');
chalkPino.error('Failed to locate secondary recovery node.', new Error('CONNECTION_TIMEOUT'));
chalkPino.debug('Current system allocation tables:', { activeThreads: 4, memoryHeapMb: 142 });


chalkPino.log('\n--- 2. Testing Contextual Chained Scopes --- \n');
const cluster = chalkPino.scope({ scopedLabels: { cluster_1: 'purple' } });
cluster.info('Spawning network listeners...');

const shard = cluster.scope({ scopedLabels: { shard_2: 'blue' } });
shard.success('Gateway connection established.');

const command = shard.scope({ scopedLabels: { command_ping: 'peach' } });
command.debug('Evaluating routing table round-trip variables.');


chalkPino.log('\n--- 3. Testing Native Domain Analyzers --- \n');
const gateway = chalkPino.scope({ scopedLabels: { network: 'violet' } });
gateway.api('GET', '/api/v2/guilds/123984/members', 200, 14.2);
gateway.api('POST', '/api/v2/auth/login', 401, 8.7);
gateway.ws('GUILD_CREATE', 'ws_session_x99', 'CONNECTED', 'Shard matching completed');
gateway.cron('database-vacuum-job', 'SUCCESS', 'Purged 420 expired indexing rows');


chalkPino.log('\n--- 4. Testing Custom File Storage Output Instances --- \n');
const logger = new ChalkPino({
  logFile: './logs/chalkPino.log',
  labels: { worker_core: 'orange' }
});
logger.info('Background worker pool initialized.');
logger.warn('Job worker thread #3 stalled. Re-queueing tasks.');
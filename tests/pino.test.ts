import { PinoChalk } from '../src/index';

const pinoChalk = new PinoChalk({
  mode: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  timestamps: true,
  labels: {
    system: 'sky'
  }
});


console.log('--- 1. Global Root Logger --- \n');
pinoChalk.info('Booting core engine services...');
pinoChalk.success('System dependencies validated successfully.');
pinoChalk.warn('High memory threshold detected on sub-process.');
pinoChalk.error('Failed to locate secondary recovery node.', new Error('CONNECTION_TIMEOUT'));
pinoChalk.debug('Current system allocation tables:', { activeThreads: 4, memoryHeapMb: 142 });


console.log('\n--- 2. Testing Contextual Chained Scopes --- \n');
const cluster = pinoChalk.scope({ scopedLabels: { cluster_1: 'purple' } });
cluster.info('Spawning network listeners...');

const shard = cluster.scope({ scopedLabels: { shard_2: 'blue' } });
shard.success('Gateway connection established.');

const command = shard.scope({ scopedLabels: { command_ping: 'peach' } });
command.debug('Evaluating routing table round-trip variables.');


console.log('\n--- 3. Testing Native Domain Analyzers --- \n');
const gateway = pinoChalk.scope({ scopedLabels: { network: 'violet' } });
gateway.api('GET', '/api/v2/guilds/123984/members', 200, 14.2);
gateway.api('POST', '/api/v2/auth/login', 401, 8.7);
gateway.ws('GUILD_CREATE', 'ws_session_x99', 'CONNECTED', 'Shard matching completed');
gateway.cron('database-vacuum-job', 'SUCCESS', 'Purged 420 expired indexing rows');


console.log('\n--- 4. Testing Custom Storage and Webhook Output Instances --- \n');
const logger = new PinoChalk({
  file: './logs/pinochalk.log',
  labels: {
    worker_core: 'orange'
  }
});

const workerCore = logger.scope({ scopedLabels: { worker_core: true } });
workerCore.info('Background worker pool initialized.');
workerCore.warn('Job worker thread #3 stalled. Re-queueing tasks.');
import { Chalk } from '../src/index';

const chalk = new Chalk({
  timestamps: true,
  labels: {
    system: 'sky'
  }
});


console.log('--- 1. Global Root Logger --- \n');
chalk.info('Booting core engine services...');
chalk.success('System dependencies validated successfully.');
chalk.warn('High memory threshold detected on sub-process.');
chalk.error('Failed to locate secondary recovery node.', new Error('ENOENT: no such file or directory'));
chalk.debug('Current system allocation tables:', { activeThreads: 4, memoryHeapMb: 142 });


console.log('\n--- 2. Testing Contextual Chained Scopes --- \n');
const cluster = chalk.scope({ scopedLabels: { cluster_1: 'purple' } });
cluster.info('Spawning network listeners...');

const shard = cluster.scope({ scopedLabels: { shard_2: 'blue' } });
shard.success('Gateway connection established.');

const command = shard.scope({ scopedLabels: { command_ping: 'peach' } });
command.debug('Evaluating routing table round-trip variables.');


console.log('\n--- 3. Testing Native Domain Analyzers --- \n');
const gateway = chalk.scope({ scopedLabels: { network: 'violet' } });
gateway.api('GET', '/api/v2/guilds/123984/members', 200, 14.2);
gateway.api('POST', '/api/v2/auth/login', 401, 8.7);
gateway.ws('GUILD_CREATE', 'ws_session_x99', 'CONNECTED', 'Shard matching completed');
gateway.cron('database-vacuum-job', 'SUCCESS', 'Purged 420 expired indexing rows');


console.log('\n--- 4. Testing Custom File Storage Output Instances --- \n');
const worker = new Chalk({
  file: './logs/chalk.log',
  useColors: true,
  labels: {
    worker_core: 'orange'
  }
});

worker.info('Background worker pool initialized.');
worker.warn('Job worker thread #3 stalled. Re-queueing tasks.');


console.log('\n--- 5. Testing Inline Functional Color Helpers --- \n');
console.log(chalk.color('red', 'This is standard plain red text'));
console.log(chalk.bcolor('green', 'This is high-visibility bold green text'));
console.log(chalk.hex('#ff00ff', 'Custom hex token colored configuration line'));
console.log(chalk.rgb([120, 200, 255], 'Custom raw 24-bit RGB tuple array assignment line'));
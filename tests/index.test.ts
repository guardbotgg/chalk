import chalk, { Chalk } from '../src/index';

// Default instance
chalk.info(['client'], 'Booting application...');
chalk.success(['client'], 'Logged in successfully!');
chalk.warn(['cache'], 'Cache miss for guild 123');
chalk.error(['db'], new Error('Database connection failed'));
chalk.debug(['dev'], { users: 1200, guilds: 55 });

// Scoped loggers
const cluster = chalk.cluster(1);
cluster.info([], 'Cluster is ready');

const shard = chalk.shard(2);
shard.success([], 'Shard connected');

const command = chalk.command('ping');
command.debug([], 'Executing ping command');

// Timers
chalk.time('startup');
setTimeout(() => {
  chalk.timeEnd('startup', ['monitor']);
}, 500);

// Custom instance with options
const logger = new Chalk({
  prefix: 'WORKER',
  file: './logs/test.log',
  useColors: true,
  labels: {
    api: '#00e0ff',
    queue: [255, 150, 50],
  },
});

logger.info(['api'], 'API server started');
logger.warn(['queue'], 'Job delayed');

// Color helpers
console.log(logger.color('red', 'This is red text'));
console.log(logger.bcolor('red', 'This is bold red text'));
console.log(logger.hex('#ff00ff', 'Hex colored text'));
console.log(logger.rgb([120, 200, 255], 'RGB tuple colored text'));
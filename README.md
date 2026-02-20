# @guardbot/chalk
> **A simple colored logger built for Discord bots.**

<div>
  <img src="https://raw.githubusercontent.com/guardbotgg/assets/master/made-with-typescript.svg" alt="badge" />
  <img src="https://raw.githubusercontent.com/guardbotgg/assets/master/made-with-love.svg" alt="badge" />
</div >


## 📦 Installation
```bash
$ npm install @guardbot/chalk # via npm
$ yarn add @guardbot/chalk    # via yarn
$ pnpm add @guardbot/chalk    # via pnpm
```


## 🪴 Basic Usage
```ts
import { logger } from '@guardbot/chalk';

logger.info(['client'], 'Bot started');
logger.success(['command'], 'Ping executed');
logger.warn(['cluster'], 'High memory usage');
logger.error(['shard'], new Error('Something broke'));
```


### Scoped Loggers:
```ts
import { logger } from '@guardbot/chalk';

const shardLogger = logger.shard(1);
shardLogger.info([], 'Shard ready');

const commandLogger = logger.command('ping');
commandLogger.success([], 'Command executed');
```


### Custom Colors:
```ts
import { Chalk } from '@guardbot/chalk';

const logger = new Chalk({
  labels: { database: '#4ADE80' }
});

logger.info(['database'], 'Connected successfully');
logger.rgb([255, 100, 50], 'Custom RGB color');
logger.color('#4ADE80', 'Custom Hex Color');
```


### File Logging:
```ts
const log = new Chalk({ file: './logs/bot.log' });
log.info(['client'], 'Saved to file');
```

### Webhook Logging:
```ts
const log = new Chalk({ webhook: 'https://discord.com/api/webhooks/...' });
log.error(['client'], 'Critical failure!');
```

### Timestamps:
```ts
const log = new Chalk({
  timestamps: true,
  timestampFormat: (date) => date.toISOString()
});
```

### Timers:
```ts
logger.time('load');
await doSomething();
logger.timeEnd('load', ['client']);
```


## 🪴 Support Server
<a href="https://discord.gg/invite/GaczkwfgV9" target="_blank">
  <img src="https://discordwidgets.vercel.app/widgets/invite/GaczkwfgV9?theme=dark" alt="Invite" />
</a>
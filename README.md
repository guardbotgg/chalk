# @guardbot/chalk
> **A simple colored logger built for apps.**

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


## 📌 Choose Your Engine
* **`Chalk` (Vanilla Engine):** Pure terminal piping, perfect for lightweight automation runners, CLI utilities, or small-scale applications.
* **`PinoChalk` (Production Core):** Backed by the multi-threaded asynchronous `pino` worker stream architecture.


## 🪴 Basic Usage
```ts
import { Chalk, PinoChalk } from '@guardbot/chalk';

const logger = new Chalk({
  timestamps: true,
  labels: { client: 'blue' }
});

logger.info('Bot started');
logger.success('Ping executed');
logger.warn('High memory usage');
logger.error(new Error('Something broke'));
```


### Scoped Loggers:
```ts
const logger = new Chalk({
  timestamps: true,
  labels: { client: 'blue' }
});

const cluster = logger.scope({ scopedLabels: { cluster_0: true } });
cluster.info('Spawning structural cluster components...'); 

const shard = cluster.scope({ scopedLabels: { shard_4: 'blue' } });
shard.success('Shard gateway synchronization complete.'); 
```


### Custom Colors:
```ts
import { Chalk } from '@guardbot/chalk';

const logger = new Chalk({
  labels: { database: '#4ADE80' }
});

logger.info('Connected successfully');
logger.rgb([255, 100, 50], 'Custom RGB color');
logger.color('#4ADE80', 'Custom Hex Color');
```


### File Logging:
```ts
const log = new Chalk({ file: './logs/bot.log' });
log.info('Saved to file');
```

### Webhook Logging:
```ts
const log = new Chalk({ webhook: 'https://discord.com/api/webhooks/...' });
log.error('Critical failure!');
```

### Timestamps:
```ts
const log = new Chalk({
  timestamps: true,
  timestampFormat: (date) => date.toISOString()
});
```


## 🪴 Support Server
<a href="https://discord.gg/invite/GaczkwfgV9" target="_blank">
  <img src="https://discordwidgets.vercel.app/widgets/invite/GaczkwfgV9?theme=dark" alt="Invite" />
</a>
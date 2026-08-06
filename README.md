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


## ☘️ Chalk Levels
|  Level  | Numeric Value |                                      Description                                         |
|:-------:|:-------------:|------------------------------------------------------------------------------------------|
| `fatal` |     `60`      | Critical, unrecoverable errors that cause the application to crash or terminate.         |
| `error` |     `50`      | Operational errors that require attention but allow the application to continue running. |
| `warn`  |     `40`      | Unexpected or potentially problematic events that should be monitored.                   |
| `info`  |     `30`      | General application events that reflect normal operation.                                |
| `debug` |     `20`      | Diagnostic information useful for development and troubleshooting.                       |
| `trace` |     `10`      | Highly detailed execution logs for in-depth debugging.                                   


## 🪴 Basic Usage
```ts
import { Chalk } from '@guardbot/chalk';

const logger = new Chalk({
  timestamps: true,
  labels: { client: 'blue' }
});

logger.info('Bot started');
logger.warn('High memory usage');
logger.error(new Error('Something broke'));
```


### Scoped Loggers
Create child loggers that inherit configuration while adding their own labels.

```ts
const logger = new Chalk({
  labels: { client: 'blue' }
});

const shard = logger
  .scope({ scopedLabels: { cluster: true } })
  .scope({ scopedLabels: { shard_4: 'cyan' } });

shard.info('Gateway connected');
```
**Output**
```text
[CLIENT] [CLUSTER] [SHARD_4] [INFO] Gateway connected
```


### Custom Colors
Use built-in colors or provide your own Hex and RGB values.

```ts
import { Chalk } from '@guardbot/chalk';

const logger = new Chalk({
  labels: { database: '#4ADE80' }
});

logger.red('Error');
logger.bGreen('Success');
logger.color('#4ADE80', 'Custom Hex Color');
logger.rgb([255, 100, 50], 'Custom RGB Color');
```


### Specialized Loggers
Built-in helpers for common application events.

```ts
logger.api('GET', '/users', 200, 18.4);

logger.ws(
  'READY',
  'socket-1',
  'CONNECTED',
  'Gateway connection established'
);

logger.cron(
  'Daily Cleanup',
  'SUCCESS',
  'Completed in 1.2s'
);
```

## ⚙️ Configuration

### File Logging
```ts
const logger = new Chalk({
  file: './logs/bot.log'
});
logger.info('Saved to file');
```

### Webhook Logging
```ts
const logger = new Chalk({
  webhook: 'https://discord.com/api/webhooks/...'
});
logger.error('Critical failure!');
```

### Custom Timestamps
```ts
const logger = new Chalk({
  timestamps: true,
  timestampFormat: (date) => date.toISOString()
});
```


## 🪴 Support Server
<a href="https://discord.gg/invite/GaczkwfgV9" target="_blank">
  <img src="https://discordwidgets.vercel.app/widgets/invite/GaczkwfgV9?theme=dark" alt="Invite" />
</a>
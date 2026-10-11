# @guardbot/chalk
**A fast, colorful logger built for apps, with pretty & JSON output.**

<div>
  <img src="https://readmebadges.netlify.app/badges/made-with-ts.svg" alt="Made with TypeScript" />
  <img src="https://readmebadges.netlify.app/badges/made-with-love.svg" alt="Made with love" />
</div>


## 📦 Installation
```bash
$ npm install @guardbot/chalk # via npm
$ yarn add @guardbot/chalk    # via yarn
$ pnpm add @guardbot/chalk    # via pnpm
```
Requires **Node.js 22.12 or newer**. Upgrading from 2.x? See the [changelog](./CHANGELOG.md#300).


## 🪴 Getting Started
```ts
import { Chalk } from '@guardbot/chalk';

const logger = new Chalk({
  level: process.env.DEBUG ? 'debug' : 'info',
  labels: { client: 'orange' },
  file: './logs/bot.log',
  webhook: process.env.LOGS_WEBHOOK,
});

logger.info('Logged in as', client.user.tag);
logger.warn('High memory usage:', { heapMb: 512 });
logger.error('Failed to ban the member.', error);
logger.success('Serving 42 servers.');
```


## ☘️ Log Levels
| Method | Level (Value) | Description |
| :---: | :---: | --- |
| `fatal()` | `fatal` (60) | Unrecoverable errors that require the application to terminate. |
| `error()` | `error` (50) | Errors that need attention but allow the application to continue. |
| `warn()` | `warn` (40) | Unexpected events or potential problems that should be monitored. |
| `info()` | `info` (30) | General information about application activity (**default**). |
| `success()` | `info` (30) | Successful operations highlighted with a green badge. |
| `log()` | `info` (30) | General messages displayed without a level badge. |
| `debug()` | `debug` (20) | Diagnostic information useful for development and troubleshooting. |
| `trace()` | `trace` (10) | Detailed execution logs for in-depth debugging. |

Each logger prints messages at its configured level and above. 
Set `level: 'silent'` to disable logging.


## 📘 Scopes and Fields
Scopes add labels to log entries and share their parent's transports.
```ts
const redis = logger.scope('redis', 'violet');
const shard = logger.scope({ shard_4: 'cyan', client: false });

redis.warn('Connection lost');
// [CLIENT] [REDIS] [WARN] Connection lost

shard.info('Gateway connected');
// [SHARD_4] [INFO] Gateway connected
```

Use `child()` to attach structured fields to every entry from a logger.
```ts
const log = logger.child({ guildId: guild.id });
log.info('Member joined', { userId: member.id });
```
Fields appear as JSON properties or `key=value` pairs in pretty output.


## 🎐 JSON Logging
Set `format: 'json'` for newline-delimited JSON output, suitable for log collectors such as Loki, Datadog, and Better Stack.
```ts
const logger = new Chalk({
  format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
});

logger.scope('client').child({ shard: 4 }).error(
  'Failed to ban the member.',
  { userId: '2' },
  error,
);
```

Example output:
```json
{
  "level": "error",
  "time": "2026-09-26T13:32:33.415Z",
  "scope": "client",
  "msg": "Failed to ban the member.",
  "shard": 4,
  "userId": "2",
  "err": {
    "type": "DiscordAPIError",
    "message": "Missing Permissions",
    "code": 50013,
    "status": 403
  }
}
```


## 📁 File Logging
```ts
new Chalk({ file: './logs/bot.log' });

new Chalk({
  file: {
    path: './logs/bot.log',
    level: 'warn',
    format: 'json',
  },
});

new Chalk({
  file: { path: './logs/bot.log', sync: false },
});
```
Files are opened once, and their directories are created automatically. Multiple loggers can share the same file.
By default, logs are written synchronously in batches. Set `sync: false` for background writes that avoid blocking the application on slow disks.


## 🔔 Discord Webhooks
```ts
new Chalk({ webhook: process.env.LOGS_WEBHOOK });

new Chalk({
  webhook: {
    url: 'https://discord.com/api/webhooks/...',
    level: 'error',
    username: 'Guard Logs',
    avatarURL: 'https://example.com/logs.png',
    threadId: '123',
    interval: 2000,
  },
});
```
Logs are sent as colored embeds, batched up to 10 per message, with repeated lines grouped together.
Rate limits are respected, failed requests are retried up to three times, and delivery pauses temporarily when Discord is unavailable.


## 🧩 Custom Transports
Add your own outputs by implementing the `Transport` interface.
```ts
import { Chalk, ConsoleTransport, type Transport } from '@guardbot/chalk';

const sentry: Transport = {
  level: 'error',
  write: (record) =>
    Sentry.captureException(
      record.error ?? new Error(record.message),
      { extra: record.fields },
    ),
};

const logger = new Chalk({
  level: 'debug',
  console: { level: 'info' },
  file: './logs/debug.log',
  transports: [
    sentry,
    new ConsoleTransport({
      stream: process.stderr,
      level: 'error',
      format: 'json',
    }),
  ],
});
```

Each transport receives records at its configured level and above, subject to the logger's level. Use `console: false` to disable the default console transport.
Built-in transports: `ConsoleTransport`, `FileTransport`, and `WebhookTransport`.


## 🎨 Colors and Timestamps
```ts
logger.red('text');
logger.bGreen('bold text');
logger.color('#4ADE80', 'hex');
logger.bcolor([255, 100, 50], 'rgb, in bold');
logger.strip(coloredText);
```

Available colors include red, orange, yellow, green, cyan, blue, purple, violet, sky, pink, peach, and grey. Bold variants are available through the `b` prefix.
Colors adapt to terminal support and respect `NO_COLOR` and `FORCE_COLOR`. Files, JSON output, and webhooks never contain terminal color codes.

```ts
new Chalk({ timestamps: 'datetime' }); // Default
new Chalk({ timestamps: 'time' });
new Chalk({ timestamps: 'iso' });
new Chalk({ timestamps: false });

const format = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});

new Chalk({ timestamps: (date) => format.format(date) });
```

Timestamps use the local time zone unless configured otherwise. File logs always include timestamps.

## 🛰️ Helpers

```ts
logger.api('GET', '/users', 200, 18.4);
logger.ws('READY', 'socket-1', 'CONNECTED', 'Gateway connection established');
logger.cron('Daily Cleanup', 'SUCCESS', 'Completed in 1.2s');
```

`api()` selects the log level based on the HTTP status. `ws()` and `cron()` include their details as structured fields in JSON output.

## 🚀 Production and Shutdown

Flush pending logs and close transports during shutdown.

```ts
process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await client.destroy();
  await logger.close();
  process.exit(0);
});
```
Use `await logger.flush()` to wait for pending logs without closing transports. Both methods wait up to five seconds for pending webhook delivery.


## 📘 Options
| Option | Default | Description |
| :---: | :---: | --- |
| `level` | `'info'` | Minimum log level to output. |
| `format` | `'pretty'` | Output format: `'pretty'` or `'json'`. |
| `colors` | `Auto` | Enables pretty console colors automatically when supported. |
| `timestamps` | `'datetime'` | Timestamp format: `'datetime'`, `'time'`, `'iso'`, a custom function, or `false`. |
| `labels` |  | Labels and their associated colors. |
| `fields` |  | Custom fields attached to every log record. |
| `console` | `true` | Enables console output or accepts `{ stream, level }` configuration. |
| `file` |  | File output path or `{ path, level, format, sync }` configuration. |
| `webhook` |  | Webhook URL or `{ url, level, username, avatarURL, threadId, interval }` configuration. |
| `transports` | `[]` | Custom logging transports. |

Empty or `false` values for `file` and `webhook` disable those outputs.

## 🪴 Support
[![Discord](https://discordwidgets.vercel.app/widgets/invite/GaczkwfgV9?theme=dark)](https://discord.gg/invite/GaczkwfgV9)
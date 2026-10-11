
# Changelog

## 3.0.0
Version 3.0.0 is a complete rewrite of the logger. There is now a single `Chalk` class for both pretty and JSON logging, with no dependencies or worker threads. Logging outputs are handled through transports, including the console, files, webhooks, and custom transports. Each transport can have its own log level.


### Migrating from 2.x
1. **`ChalkPino` has been removed.** Use `Chalk` instead. It handles logging directly without Pino, and the `mode` option has been renamed to `format`.

   ```diff
   - import { ChalkPino } from '@guardbot/chalk';
   - const logger = new ChalkPino({ mode: 'json' });
   + import { Chalk } from '@guardbot/chalk';
   + const logger = new Chalk({ format: 'json' });
   ```

2. **Several options have been renamed.** `logFile`, `logWebhook`, `useColors`, `useTimestamps`, and `timestampFormat` have been replaced with `file`, `webhook`, `colors`, and `timestamps`. The `timestamps` option now accepts a formatting function.

   ```diff
   new Chalk({
   -  logFile: env.CHALK_FILE,
   -  logWebhook: env.CHALK_WEBHOOK,
   -  useColors: true,
   -  useTimestamps: env.CHALK_TIMESTAMPS,
   -  timestampFormat: (date) => format(date),
   +  file: env.CHALK_FILE,
   +  webhook: env.CHALK_WEBHOOK,
   +  colors: true,
   +  timestamps: env.CHALK_TIMESTAMPS && ((date) => format(date)),
   });
   ```

3. **`scope()` now accepts labels directly.** You can pass a single label and its color or an object containing multiple labels.

   ```diff
   - logger.scope({ scopedLabels: { redis: 'violet' } });
   + logger.scope('redis', 'violet');
   + logger.scope({ redis: 'violet' });
   ```

   The `level`, `logFile`, and `logWebhook` options have been removed from `scope()`. Scoped loggers inherit the parent logger's level unless their own level is set through `scoped.level`. Create a separate logger if you need a different file or webhook.

4. **`log()` now uses the `info` level.** It follows the same filtering rules as `info()`. Previously, `log()` always printed messages regardless of the configured level. JSON output now uses `"level":"info"` instead of Pino's `"level":"fatal"`.

5. **Webhooks default to `warn` and above.** In 2.x, webhooks also received `success()` messages. To include `info` messages, set the webhook level explicitly.

   ```ts
   webhook: { url, level: 'info' }
   ```

6. **The JSON log format has changed.** A log entry now looks like this:

   ```json
   {
     "level": "info",
     "time": "2026-09-26T13:32:33.412Z",
     "scope": "client:shard_4",
     "msg": "..."
   }
   ```

   In 2.x, JSON output used Pino's format, including numeric levels, timestamps in milliseconds, process information, and a `scopes` array. The new format uses a readable level name and a single `scope` field. Objects passed to the logger are included as fields in the JSON output, and errors are stored in an `err` object instead of being converted into message text.

7. **Pretty log output has changed slightly.** The default timestamp format is now `[2026-09-26 19:02:33.412]`, replacing `[9/26/26, 19:02:33]`. The `INFO` label is now blue instead of yellow, and `DEBUG` is violet instead of orange.

8. **Invalid options now throw errors during initialization.** Unknown log levels, unsupported colors, and invalid webhook URLs throw a `ChalkError`. Previously, unknown colors fell back to white. If a log file cannot be opened, the underlying file system error is thrown.

9. **Node.js 22.12 or newer is required.**


### Added
- **JSON and pretty formats:** Set `format: 'json'` or `format: 'pretty'` on any logger. Colors adapt to the terminal's supported color depth (truecolor, 256 colors, or 16 colors) and respect `NO_COLOR` and `FORCE_COLOR`.
- **Structured logging:** Use `child(fields)` or the `fields` option to attach structured data to log entries. Fields appear as JSON keys in JSON mode or as `key=value` pairs at the end of pretty log lines.
- **Transport support:** Console, file, and webhook transports are built in. Each can have its own log level, and file transports can also specify a format. Custom transports can be added through `transports`. `ConsoleTransport`, `FileTransport`, and `WebhookTransport` are exported.
- **Runtime log levels:** Change `logger.level` while the application is running. Scoped loggers inherit the parent level until their own level is set. `isLevelEnabled()` and the `silent` level are also available.
- **Graceful shutdown:** `flush()` and `close()` let you flush pending logs and close transports cleanly.
- **Improved error output:** Errors include additional properties, such as a `DiscordAPIError`'s `code` and `status`, along with causes and aggregated errors. Stack frames from Node.js and dependencies are dimmed.
- **Webhook improvements:** Webhooks send embeds with colors based on log level, support up to 10 embeds per message, and combine repeated log lines with a count. They respect Discord's rate limits and pause delivery when Discord is unavailable. You can also set a custom `username`, `avatarURL`, and thread destination. `flush()` waits up to five seconds for pending webhook messages.
- **Optional outputs:** Empty or `false` values for `file` and `webhook` are ignored, so environment variables can be passed directly without extra checks. Webhooks also accept `URL` objects.
- **Timestamp options:** Use `timestamps: 'time'` or `timestamps: 'iso'` for the built-in timestamp formats.
- **Background file writing:** Set `file: { sync: false }` to write log files in the background instead of blocking the application while waiting for disk writes.
- **Exported types:** `LogRecord`, `Transport`, and the option types are now exported.


### Fixed
- `ChalkPino` used to run `pino-pretty` in a worker thread in pretty mode, causing each line to be formatted twice.
- Log files were opened and closed for every line. The new implementation keeps file handles open, reducing overhead and preventing pending log entries from being lost as easily during a crash.
- Webhooks previously sent a separate request for every line and did not handle rate limits properly, causing logs to be dropped during bursts of errors.
- Log messages containing mentions such as `@everyone` could trigger unwanted pings. Webhook messages now set `allowed_mentions` to prevent this.
- Errors in JSON output were previously converted into message strings, sometimes including terminal color codes. They now retain their structure in an `err` object.
- Nested colors, such as `logger.red(\`a ${logger.green('b')} c\`)`, now render correctly without resetting the outer color.
- `api()` previously logged every status at `info` level in `Chalk`. It now uses the appropriate level for each status.
- `cron()` previously displayed `[SUCCESS]` for jobs that were still `STARTING`. The status is now reported correctly.

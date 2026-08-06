import { stripAnsi } from './formatters';
import fs from 'node:fs/promises';


const fileQueues = new Map<string, Promise<unknown>>();
const webhookQueues = new Map<string, Promise<unknown>>();
const nativeFetch = globalThis.fetch;


export function appendFile(file: string, content: string): Promise<void> {
  const prev = fileQueues.get(file) ?? Promise.resolve();
  const next = prev
    .then(() => fs.appendFile(file, stripAnsi(content) + '\n'))
    .catch(() => {});

  fileQueues.set(file, next);
  return next as Promise<void>;
};


export function sendWebhook(webhook: string, content: string): Promise<void> {
  const prev = webhookQueues.get(webhook) ?? Promise.resolve();
  const next = prev
    .then(async () => {
      const clean = stripAnsi(content);
      
      const truncated = clean.length > 3940 
        ? clean.slice(0, 3940) + '\n... [TRUNCATED]' 
        : clean;

      await nativeFetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `\`\`\`gcode\n${truncated}\n\`\`\``,
        }),
      });
    })
    .catch(() => {});

  webhookQueues.set(webhook, next);
  return next as Promise<void>;
};